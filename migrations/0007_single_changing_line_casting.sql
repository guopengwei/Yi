-- Preserve historical readings while preventing new writes from using the
-- retired methods that can produce zero or multiple changing lines.
CREATE TRIGGER reading_operations_single_method_insert
BEFORE INSERT ON reading_operations
WHEN NEW.casting_method <> 'three-number@1'
BEGIN
  SELECT RAISE(ABORT, 'Only three-number@1 casting is supported');
END;

CREATE TRIGGER reading_operations_single_method_update
BEFORE UPDATE OF casting_method ON reading_operations
WHEN NEW.casting_method <> 'three-number@1'
BEGIN
  SELECT RAISE(ABORT, 'Only three-number@1 casting is supported');
END;
