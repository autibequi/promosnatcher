ALTER TABLE crawlresult ADD COLUMN source_subid TEXT;
CREATE INDEX ix_crawl_result_source_subid ON crawlresult(source, source_subid);
