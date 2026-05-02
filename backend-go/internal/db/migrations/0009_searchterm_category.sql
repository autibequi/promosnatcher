ALTER TABLE searchterm ADD COLUMN category TEXT NOT NULL DEFAULT 'ecommerce' CHECK (category IN ('ecommerce','cdkey'));
