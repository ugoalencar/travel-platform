#!/bin/sh
for f in /tmp/migrations/*.sql; do
  echo "Applying: $f"
  psql -U staging_user -d travel_staging -f "$f" 2>&1 | tail -1
done
echo "Done"
