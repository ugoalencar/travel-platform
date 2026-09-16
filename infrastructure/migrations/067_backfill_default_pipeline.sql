-- ============================================================
-- BACKFILL DEFAULT PIPELINE FOR AGENCIES WITH NONE
-- ============================================================
-- 009_configurable_pipelines.sql seeded a default "Comercial" pipeline
-- for every agency that existed AT THAT MIGRATION'S RUN TIME, but
-- agency-signup.ts never mirrored that seed -- every agency created
-- since has zero pipelines and therefore no way to create a commercial
-- opportunity at all. Found while building the Pipeline page (feature
-- requested directly: "o pipeline não estou vendo"). agency-signup.ts
-- is fixed in the same change to seed this for every future signup;
-- this migration is the one-time catch-up for agencies that already
-- exist without one. Exact 1:1 mirror of 009's seed data.
-- ============================================================

INSERT INTO pipelines (id, agency_id, name, description, active)
SELECT gen_random_uuid()::TEXT, a.id, 'Comercial', 'Pipeline padrão da agência.', true
FROM agencies a
WHERE NOT EXISTS (SELECT 1 FROM pipelines p WHERE p.agency_id = a.id);

INSERT INTO pipeline_stages (id, agency_id, pipeline_id, name, sequence, color_key, visual_level, active)
SELECT gen_random_uuid()::TEXT, p.agency_id, p.id, stage_def.name, stage_def.sequence,
       stage_def.color_key::"PipelineStageColor", stage_def.visual_level::"PipelineStageVisualLevel", true
FROM pipelines p
JOIN LATERAL (
  VALUES
    ('PROSPECTING',      1, 'NEUTRAL', 'NORMAL'),
    ('INTEREST',         2, 'BLUE',    'NORMAL'),
    ('QUOTE',            3, 'BLUE',    'NORMAL'),
    ('PROPOSAL_SENT',    4, 'YELLOW',  'NORMAL'),
    ('WAITING_CUSTOMER', 5, 'YELLOW',  'ATTENTION'),
    ('NEGOTIATION',      6, 'ORANGE',  'ATTENTION'),
    ('WON',              7, 'GREEN',  'SUCCESS'),
    ('POST_SALE',        8, 'PURPLE',  'NORMAL'),
    ('LOST',             9, 'RED',     'ATTENTION')
) AS stage_def(name, sequence, color_key, visual_level) ON true
WHERE p.name = 'Comercial'
  AND NOT EXISTS (SELECT 1 FROM pipeline_stages ps WHERE ps.pipeline_id = p.id);
