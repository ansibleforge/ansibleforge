{{/*
Build the SERVICES_JSON environment variable from values.
Each entry: {"name": "...", "clientId": "...", "clientSecret": "...", "serviceUrl": "...", "validationPath": "..."}
Client secrets are read from the sso-monitor-credentials Secret via env var references,
but since we need them in a JSON blob, we use a wrapper script approach or direct secret refs.
For simplicity, we mount secrets as env vars and reference them in the JSON.
*/}}
{{- define "sso-monitor.servicesJson" -}}
{{- $clusterDomain := .Values.clusterDomain -}}
{{- $services := list -}}
{{- range $name, $svc := .Values.services -}}
  {{- if $svc.enabled -}}
    {{- $serviceUrl := "" -}}
    {{- if eq $name "gitlab" -}}
      {{- $serviceUrl = printf "https://gitlab.%s" $clusterDomain -}}
    {{- else if eq $name "ocp" -}}
      {{- $serviceUrl = printf "https://oauth-openshift.%s" $clusterDomain -}}
    {{- else if eq $name "aap" -}}
      {{- $serviceUrl = printf "https://aap-aap.%s" $clusterDomain -}}
    {{- end -}}
    {{- $entry := dict "name" $name "clientId" $svc.clientId "clientSecretEnv" (printf "%s_CLIENT_SECRET" ($name | upper)) "serviceUrl" $serviceUrl "validationPath" ($svc.validationPath | default "") -}}
    {{- $services = append $services $entry -}}
  {{- end -}}
{{- end -}}
{{- $services | toJson -}}
{{- end -}}
