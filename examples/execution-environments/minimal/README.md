# Minimal Execution Environment

This starter EE is source-only. Copy it under `containers/`, edit the dependency files, and run `ansible-builder create` before building it in OpenShift.

```bash
cp -R examples/execution-environments/minimal containers/ee-example
cd containers/ee-example
ansible-builder create
```

Commit and push the generated `context/` directory, then apply a raw ImageStream and BuildConfig with `oc apply`.

See `docs/docs/implementation/execution-environment-buildconfig.md` for the full flow.
