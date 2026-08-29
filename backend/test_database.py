import tempfile
import unittest
from pathlib import Path

import database
from schemas import (
    BreakSessionCreate,
    DailyRecordCreate,
    DailyDraftUpsert,
    DraftBreak,
    DraftWorkSession,
    QuestCreate,
    WorkSessionCreate,
)


class DatabaseBehaviorTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.original_database_path = database.DATABASE_PATH
        database.DATABASE_PATH = Path(self.temp_dir.name) / "test.db"
        database.initialize_database()

    def tearDown(self):
        database.DATABASE_PATH = self.original_database_path
        self.temp_dir.cleanup()

    @staticmethod
    def record(date="2031-01-06", trips=5, **updates):
        values = {
            "date": date,
            "online_hours": 4,
            "trips": trips,
            "net_fare": 40,
            "tips": 10,
            "cash_tips": 0,
            "promotions": 0,
        }
        values.update(updates)
        return DailyRecordCreate(**values)

    def row_id_for(self, date):
        connection = database.get_connection()
        row = connection.execute(
            "SELECT id FROM daily_logs WHERE date = ?", (date,)
        ).fetchone()
        connection.close()
        return row["id"]

    def test_date_move_preserves_id_and_blocks_an_occupied_target(self):
        source = self.record()
        database.create_daily_record(source)
        source_id = self.row_id_for(source.date)

        moved = source.model_copy(update={"date": "2031-01-07"})
        database.update_daily_record(source.date, moved)
        self.assertEqual(source_id, self.row_id_for(moved.date))

        database.create_daily_record(self.record(date="2031-01-08"))
        occupied = moved.model_copy(update={"date": "2031-01-08"})
        with self.assertRaises(database.DailyDateConflictError):
            database.update_daily_record(moved.date, occupied)

    def test_sessions_and_breaks_preserve_real_time_and_work_mileage_rules(self):
        record = self.record(
            work_start_time="12:00 PM",
            uber_stop_time="8:00 PM",
            start_odometer=100,
            end_work_odometer=200,
            breaks=[
                BreakSessionCreate(
                    start_time="4:00 PM",
                    end_time="5:00 PM",
                    start_odometer=140,
                    end_odometer=146,
                )
            ],
        )
        saved = database.create_daily_record(record)

        self.assertEqual(saved["real_work_hours"], 7)
        self.assertEqual(saved["break_hours"], 1)
        self.assertEqual(saved["break_miles"], 6)
        self.assertEqual(saved["work_miles"], 94)

    def test_miles_between_separate_sessions_are_not_counted(self):
        record = self.record(
            work_start_time="12:00 PM",
            uber_stop_time="1:00 PM",
            start_odometer=100,
            end_work_odometer=120,
            additional_sessions=[
                WorkSessionCreate(
                    start_time="5:00 PM",
                    stop_time="8:30 PM",
                    start_odometer=135,
                    stop_odometer=180,
                )
            ],
        )
        saved = database.create_daily_record(record)

        self.assertEqual(saved["real_work_hours"], 4.5)
        self.assertEqual(saved["work_miles"], 65)

    def test_quest_progress_recalculates_after_a_date_move(self):
        quest = database.create_quest(
            QuestCreate(
                start_date="2031-01-06",
                end_date="2031-01-12",
                first_tier_trips=5,
                first_tier_bonus=10,
                final_tier_trips=10,
                final_additional_bonus=10,
            )
        )
        record = self.record(date="2031-01-06", trips=5)
        database.create_daily_record(record)
        progressed = next(item for item in database.get_quests() if item["id"] == quest["id"])
        self.assertEqual(progressed["progress_trips"], 5)

        database.update_daily_record(
            record.date,
            record.model_copy(update={"date": "2031-01-20"}),
        )
        recalculated = next(item for item in database.get_quests() if item["id"] == quest["id"])
        self.assertEqual(recalculated["progress_trips"], 0)

    def test_live_draft_persists_open_session_break_and_resume_states(self):
        working = database.upsert_daily_draft(
            DailyDraftUpsert(
                date="2031-01-09",
                sessions=[DraftWorkSession(start_time="12:00 PM", start_odometer=100)],
            )
        )
        self.assertEqual(working["status"], "working")

        on_break = database.upsert_daily_draft(
            DailyDraftUpsert(
                date="2031-01-09",
                sessions=[
                    DraftWorkSession(
                        start_time="12:00 PM",
                        start_odometer=100,
                        breaks=[DraftBreak(start_time="2:00 PM", start_odometer=125)],
                    )
                ],
            )
        )
        self.assertEqual(on_break["status"], "on_break")

        between_sessions = database.upsert_daily_draft(
            DailyDraftUpsert(
                date="2031-01-09",
                sessions=[
                    DraftWorkSession(
                        start_time="12:00 PM",
                        stop_time="4:00 PM",
                        start_odometer=100,
                        stop_odometer=140,
                        breaks=[
                            DraftBreak(
                                start_time="2:00 PM",
                                end_time="2:30 PM",
                                start_odometer=125,
                                end_odometer=127,
                            )
                        ],
                    )
                ],
            )
        )
        self.assertEqual(between_sessions["status"], "between_sessions")
        self.assertEqual(database.get_daily_drafts()[0]["sessions"][0]["stop_odometer"], 140)

        returned_home = database.upsert_daily_draft(
            DailyDraftUpsert(
                date="2031-01-09",
                sessions=between_sessions["sessions"],
                home_end_time="4:25 PM",
                end_home_odometer=146,
            )
        )
        self.assertEqual(returned_home["status"], "returned_home")
        self.assertEqual(returned_home["home_end_time"], "4:25 PM")
        self.assertEqual(returned_home["end_home_odometer"], 146)

    def test_live_draft_rejects_a_break_outside_its_session(self):
        with self.assertRaisesRegex(ValueError, "inside its session"):
            database.upsert_daily_draft(
                DailyDraftUpsert(
                    date="2031-01-09",
                    sessions=[
                        DraftWorkSession(
                            start_time="12:00 PM",
                            stop_time="1:00 PM",
                            breaks=[DraftBreak(start_time="12:30 PM", end_time="2:00 PM")],
                        )
                    ],
                )
            )

    def test_live_draft_rejects_return_home_before_session_stop(self):
        with self.assertRaisesRegex(ValueError, "earlier than the last session stop"):
            database.upsert_daily_draft(
                DailyDraftUpsert(
                    date="2031-01-09",
                    sessions=[
                        DraftWorkSession(
                            start_time="12:00 PM",
                            stop_time="4:00 PM",
                            stop_odometer=140,
                        )
                    ],
                    home_end_time="3:45 PM",
                    end_home_odometer=145,
                )
            )


if __name__ == "__main__":
    unittest.main()
