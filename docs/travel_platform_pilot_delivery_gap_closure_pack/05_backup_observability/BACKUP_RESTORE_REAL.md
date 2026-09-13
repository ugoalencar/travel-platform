# Backup / Restore Real

Executar em staging:
1. backup;
2. banco efêmero limpo;
3. restore;
4. validar schema;
5. validar migration history;
6. validar registros;
7. smoke app/API;
8. medir tempo.

Gate: RESTORE PASS.
Meta provisória: RPO <= 1h, RTO <= 4h.
