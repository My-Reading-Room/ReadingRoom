-- Daily goal changes are dated with the reader's LOCAL date, but the original
-- policies required effective_date = CURRENT_DATE, which is the database's UTC
-- date. West of UTC that rejected every evening save (after 7pm in New York);
-- east of UTC, every morning save. Accept the UTC date ±1 day, which covers
-- every time zone. Rows stay the reader's own.

DROP POLICY IF EXISTS "Insert own goal history" ON "public"."reading_goal_history";
CREATE POLICY "Insert own goal history" ON "public"."reading_goal_history"
  FOR INSERT TO "authenticated"
  WITH CHECK (
    "user_id" = (SELECT "auth"."uid"())
    AND "effective_date" BETWEEN CURRENT_DATE - 1 AND CURRENT_DATE + 1
  );

DROP POLICY IF EXISTS "Update own goal history for today" ON "public"."reading_goal_history";
CREATE POLICY "Update own goal history for today" ON "public"."reading_goal_history"
  FOR UPDATE TO "authenticated"
  USING (
    "user_id" = (SELECT "auth"."uid"())
    AND "effective_date" BETWEEN CURRENT_DATE - 1 AND CURRENT_DATE + 1
  )
  WITH CHECK (
    "user_id" = (SELECT "auth"."uid"())
    AND "effective_date" BETWEEN CURRENT_DATE - 1 AND CURRENT_DATE + 1
  );
