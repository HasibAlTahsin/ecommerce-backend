ALTER TABLE products ADD CONSTRAINT stock_non_negative CHECK (stock >= 0);
