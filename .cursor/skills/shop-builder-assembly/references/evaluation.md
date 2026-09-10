# End-to-end evaluation log

Record one JSON object per line. Do not store credentials, partner production IDs, or
customer data. A run represents assembly from a blank mentor-provided sandbox project.

```json
{"run_id":"run-01","preset":"mobile-single-page","result":"success","manual_interventions":1,"failure":null,"notes":"Preview matched plan"}
```

Required fields:

- `run_id`: unique stable identifier.
- `preset`: one of the three documented preset names.
- `result`: `success` only when structure, localization, catalog links, readiness, and
  preview all match the confirmed plan; otherwise `failure`.
- `manual_interventions`: count of user or engineer actions needed after confirmation.
- `failure`: concise failure cause for failed runs; `null` is allowed for success.

Store the completed log as `evals/runs.jsonl`, then run:

```bash
python3 scripts/summarize_evals.py evals/runs.jsonl
```

The command passes only with at least 10 valid runs, at least 80% successes, and no
run exceeding two manual interventions. Preserve failed runs; do not rerun and replace
them merely to improve the result.
