import os
from dotenv import load_dotenv
from sqlalchemy import create_engine

# تحميل الرابط السري من ملف .env
load_dotenv()
DB_URL = os.getenv("DATABASE_URL")

def test_connection():
    if not DB_URL:
        print("❌ لم يتم العثور على رابط، تأكد من ملف .env")
        return

    try:
        print("جاري الاتصال باستخدام ملف .env الجديد...")
        engine = create_engine(DB_URL)
        connection = engine.connect()
        print("✅ نجاح: تم الاتصال بقاعدة بيانات رصيد بنجاح!")
        connection.close()
    except Exception as e:
        print("❌ فشل الاتصال، التفاصيل:")
        print(e)

if __name__ == "__main__":
    test_connection()