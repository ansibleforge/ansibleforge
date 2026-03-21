#!/bin/bash
# Replacement for ccoctl aws create-all that avoids s3:PutBucketPublicAccessBlock
# Works in AWS accounts with SCPs that block public access modifications
#
# Usage: ./ccoctl-replacement.sh --name=ocp-spark --region=us-east-2 \
#          --credentials-requests-dir=credreqs --output-dir=install-dir

set -euo pipefail

# Parse arguments
for arg in "$@"; do
  case $arg in
    --name=*) NAME="${arg#*=}" ;;
    --region=*) REGION="${arg#*=}" ;;
    --credentials-requests-dir=*) CREDREQS_DIR="${arg#*=}" ;;
    --output-dir=*) OUTPUT_DIR="${arg#*=}" ;;
    *) echo "Unknown arg: $arg"; exit 1 ;;
  esac
done

: "${NAME:?--name is required}"
: "${REGION:?--region is required}"
: "${CREDREQS_DIR:?--credentials-requests-dir is required}"
: "${OUTPUT_DIR:?--output-dir is required}"

BUCKET_NAME="${NAME}-oidc"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

echo "=== Generating OIDC signing keys ==="
mkdir -p "${OUTPUT_DIR}/tls"
openssl genrsa -out "${OUTPUT_DIR}/tls/bound-service-account-signing-key.key" 4096 2>/dev/null
openssl rsa -in "${OUTPUT_DIR}/tls/bound-service-account-signing-key.key" \
  -pubout -out "${OUTPUT_DIR}/tls/bound-service-account-signing-key.pub" 2>/dev/null

# Generate JWKS from public key
JWKS=$(python3 <<'PYEOF'
import json, base64, struct, subprocess, sys

def b64url(data):
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode()

# Extract modulus and exponent from public key
result = subprocess.run(
    ['openssl', 'rsa', '-pubin', '-in', sys.argv[1] if len(sys.argv) > 1 else '/dev/stdin',
     '-text', '-noout'],
    capture_output=True, text=True,
    input=open(f'{sys.argv[2]}/tls/bound-service-account-signing-key.pub').read() if len(sys.argv) > 2 else None
)

# Parse modulus from openssl output
lines = result.stdout.split('\n')
mod_hex = ''
capture = False
for line in lines:
    if 'Modulus:' in line:
        capture = True
        continue
    if capture:
        if 'Exponent:' in line:
            break
        mod_hex += line.strip().replace(':', '')

mod_bytes = bytes.fromhex(mod_hex)
# Ensure no leading zero issues
if mod_bytes[0] == 0:
    mod_bytes = mod_bytes[1:]

exp = 65537
exp_bytes = struct.pack('>I', exp).lstrip(b'\x00')

jwks = {
    "keys": [{
        "kty": "RSA",
        "alg": "RS256",
        "use": "sig",
        "kid": "",
        "n": b64url(mod_bytes),
        "e": b64url(exp_bytes)
    }]
}
print(json.dumps(jwks))
PYEOF
)

echo "=== Creating private S3 bucket ==="
if [ "$REGION" = "us-east-1" ]; then
  aws s3api create-bucket --bucket "${BUCKET_NAME}" --region "${REGION}"
else
  aws s3api create-bucket --bucket "${BUCKET_NAME}" --region "${REGION}" \
    --create-bucket-configuration LocationConstraint="${REGION}"
fi

echo "=== Uploading OIDC discovery documents ==="
# Create OIDC discovery document (will update issuer URL after CloudFront)
cat > /tmp/openid-configuration <<OIDCEOF
{
  "issuer": "https://PLACEHOLDER",
  "jwks_uri": "https://PLACEHOLDER/keys.json",
  "response_types_supported": ["id_token"],
  "subject_types_supported": ["public"],
  "id_token_signing_alg_values_supported": ["RS256"],
  "claims_supported": ["aud", "exp", "sub", "iat", "iss", "sub"]
}
OIDCEOF

echo "${JWKS}" > /tmp/keys.json

aws s3 cp /tmp/keys.json "s3://${BUCKET_NAME}/keys.json"
aws s3 cp /tmp/openid-configuration "s3://${BUCKET_NAME}/.well-known/openid-configuration"

echo "=== Creating CloudFront OAI + Distribution ==="
OAI_ID=$(aws cloudfront create-cloud-front-origin-access-identity \
  --cloud-front-origin-access-identity-config \
    "CallerReference=${NAME}-$(date +%s),Comment=${NAME} OIDC" \
  --query 'CloudFrontOriginAccessIdentity.Id' --output text)

OAI_CANONICAL=$(aws cloudfront get-cloud-front-origin-access-identity \
  --id "${OAI_ID}" \
  --query 'CloudFrontOriginAccessIdentity.S3CanonicalUserId' --output text)

# Grant OAI read access to the bucket
cat > /tmp/bucket-policy.json <<BPEOF
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "AllowCloudFrontOAI",
    "Effect": "Allow",
    "Principal": {"CanonicalUser": "${OAI_CANONICAL}"},
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::${BUCKET_NAME}/*"
  }]
}
BPEOF

aws s3api put-bucket-policy --bucket "${BUCKET_NAME}" --policy file:///tmp/bucket-policy.json

# Create CloudFront distribution
CF_DIST_ID=$(aws cloudfront create-distribution \
  --distribution-config "{
    \"CallerReference\": \"${NAME}-$(date +%s)\",
    \"Comment\": \"${NAME} OIDC\",
    \"Enabled\": true,
    \"Origins\": {
      \"Quantity\": 1,
      \"Items\": [{
        \"Id\": \"S3-${BUCKET_NAME}\",
        \"DomainName\": \"${BUCKET_NAME}.s3.${REGION}.amazonaws.com\",
        \"S3OriginConfig\": {
          \"OriginAccessIdentity\": \"origin-access-identity/cloudfront/${OAI_ID}\"
        }
      }]
    },
    \"DefaultCacheBehavior\": {
      \"TargetOriginId\": \"S3-${BUCKET_NAME}\",
      \"ViewerProtocolPolicy\": \"https-only\",
      \"AllowedMethods\": {\"Quantity\": 2, \"Items\": [\"GET\", \"HEAD\"]},
      \"CachedMethods\": {\"Quantity\": 2, \"Items\": [\"GET\", \"HEAD\"]},
      \"ForwardedValues\": {
        \"QueryString\": false,
        \"Cookies\": {\"Forward\": \"none\"}
      },
      \"MinTTL\": 0,
      \"DefaultTTL\": 86400,
      \"MaxTTL\": 31536000
    }
  }" \
  --query 'Distribution.Id' --output text)

CF_DOMAIN=$(aws cloudfront get-distribution --id "${CF_DIST_ID}" \
  --query 'Distribution.DomainName' --output text)

echo "CloudFront domain: ${CF_DOMAIN}"

# Wait for distribution to deploy
echo "Waiting for CloudFront distribution..."
aws cloudfront wait distribution-deployed --id "${CF_DIST_ID}"

# Update OIDC discovery with real CloudFront URL
cat > /tmp/openid-configuration <<OIDCEOF
{
  "issuer": "https://${CF_DOMAIN}",
  "jwks_uri": "https://${CF_DOMAIN}/keys.json",
  "response_types_supported": ["id_token"],
  "subject_types_supported": ["public"],
  "id_token_signing_alg_values_supported": ["RS256"],
  "claims_supported": ["aud", "exp", "sub", "iat", "iss", "sub"]
}
OIDCEOF

aws s3 cp /tmp/openid-configuration "s3://${BUCKET_NAME}/.well-known/openid-configuration"

echo "=== Creating IAM OIDC Identity Provider ==="
# Get the thumbprint for the CloudFront endpoint
THUMBPRINT=$(echo | openssl s_client -connect "${CF_DOMAIN}:443" -servername "${CF_DOMAIN}" 2>/dev/null \
  | openssl x509 -fingerprint -sha1 -noout 2>/dev/null \
  | sed 's/sha1 Fingerprint=//;s/://g' | tr '[:upper:]' '[:lower:]')

OIDC_ARN=$(aws iam create-open-id-connect-provider \
  --url "https://${CF_DOMAIN}" \
  --client-id-list "openshift" "sts.amazonaws.com" \
  --thumbprint-list "${THUMBPRINT}" \
  --query 'OpenIDConnectProviderArn' --output text)

echo "OIDC Provider ARN: ${OIDC_ARN}"

echo "=== Creating IAM Roles from CredentialsRequests ==="
mkdir -p "${OUTPUT_DIR}/manifests"

for cr_file in "${CREDREQS_DIR}"/*.yaml; do
  [ -f "$cr_file" ] || continue

  CR_NAME=$(python3 -c "
import yaml, sys
with open('${cr_file}') as f:
    d = yaml.safe_load(f)
print(d['metadata']['name'])
")
  CR_NAMESPACE=$(python3 -c "
import yaml, sys
with open('${cr_file}') as f:
    d = yaml.safe_load(f)
print(d['spec']['secretRef']['namespace'])
")
  CR_SA=$(python3 -c "
import yaml, sys
with open('${cr_file}') as f:
    d = yaml.safe_load(f)
print(d['spec'].get('serviceAccountNames', [''])[0] if d['spec'].get('serviceAccountNames') else d['metadata']['name'])
")
  POLICY_STATEMENTS=$(python3 -c "
import yaml, json, sys
with open('${cr_file}') as f:
    d = yaml.safe_load(f)
stmts = d['spec'].get('providerSpec', {}).get('statementEntries', [])
policy = []
for s in stmts:
    policy.append({
        'Effect': s.get('effect', 'Allow'),
        'Action': s.get('action', []),
        'Resource': s.get('resource', '*')
    })
print(json.dumps(policy))
")

  ROLE_NAME="${NAME}-${CR_NAMESPACE}-${CR_NAME}"
  # Truncate to 64 chars (IAM limit)
  ROLE_NAME="${ROLE_NAME:0:64}"

  echo "  Creating role: ${ROLE_NAME}"

  # Trust policy allowing the cluster SA to assume via OIDC
  TRUST_POLICY=$(cat <<TPEOF
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {"Federated": "${OIDC_ARN}"},
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": {
        "${CF_DOMAIN}:sub": "system:serviceaccount:${CR_NAMESPACE}:${CR_SA}"
      }
    }
  }]
}
TPEOF
)

  ROLE_ARN=$(aws iam create-role \
    --role-name "${ROLE_NAME}" \
    --assume-role-policy-document "${TRUST_POLICY}" \
    --query 'Role.Arn' --output text 2>/dev/null || \
    aws iam get-role --role-name "${ROLE_NAME}" --query 'Role.Arn' --output text)

  # Attach inline policy
  aws iam put-role-policy \
    --role-name "${ROLE_NAME}" \
    --policy-name "${CR_NAME}-policy" \
    --policy-document "{\"Version\":\"2012-10-17\",\"Statement\":${POLICY_STATEMENTS}}"

  # Generate the Secret manifest for the install dir
  cat > "${OUTPUT_DIR}/manifests/${CR_NAMESPACE}-${CR_NAME}-credentials.yaml" <<SECEOF
apiVersion: v1
kind: Secret
metadata:
  name: ${CR_NAME}
  namespace: ${CR_NAMESPACE}
stringData:
  credentials: |
    [default]
    role_arn = ${ROLE_ARN}
    web_identity_token_file = /var/run/secrets/openshift/serviceaccount/token
SECEOF

done

# Save metadata for cleanup
cat > "${OUTPUT_DIR}/oidc-metadata.json" <<METAEOF
{
  "name": "${NAME}",
  "bucket": "${BUCKET_NAME}",
  "cloudfront_distribution_id": "${CF_DIST_ID}",
  "cloudfront_oai_id": "${OAI_ID}",
  "oidc_provider_arn": "${OIDC_ARN}",
  "cloudfront_domain": "${CF_DOMAIN}"
}
METAEOF

echo ""
echo "=== STS credentials setup complete ==="
echo "OIDC Provider: ${OIDC_ARN}"
echo "CloudFront: https://${CF_DOMAIN}"
echo "Manifests written to: ${OUTPUT_DIR}/manifests/"
