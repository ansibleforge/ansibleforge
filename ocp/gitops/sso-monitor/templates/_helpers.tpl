{{/*
Build the SERVICES_JSON environment variable from values.
Each entry: {"name": "...", "serviceUrl": "...", "validationPath": "..."}
These are downstream services to validate tokens against after the ROPC grant.
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
    {{- $entry := dict "name" $name "serviceUrl" $serviceUrl "validationPath" ($svc.validationPath | default "") -}}
    {{- $services = append $services $entry -}}
  {{- end -}}
{{- end -}}
{{- $services | toJson -}}
{{- end -}}
