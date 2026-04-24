import os
import random
import sys
from pathlib import Path
from uuid import uuid4
from decimal import Decimal, ROUND_HALF_UP
from datetime import datetime, timedelta, timezone

from dotenv import load_dotenv
from faker import Faker

# Prevent local `supabase/` project folder from shadowing supabase-py package.
PROJECT_ROOT = Path(__file__).resolve().parent
sys.path = [p for p in sys.path if Path(p or ".").resolve() != PROJECT_ROOT]

try:
    from supabase import create_client, Client
except Exception as exc:
    raise ImportError(
        "Unable to import supabase-py. Install it with: pip install supabase "
        "and ensure no local module shadows it."
    ) from exc


# -----------------------------
# Config
# -----------------------------
PRODUCTS_COUNT = 20
CUSTOMERS_COUNT = 50
INVOICES_COUNT = 100
VAT_RATE = Decimal("15.00")

load_dotenv()
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
    raise ValueError("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing in .env")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
fake = Faker("ar_EG")


def q2(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def random_saudi_phone():
    return "05" + "".join(str(random.randint(0, 9)) for _ in range(8))


def random_invoice_date(days_back=180):
    now = datetime.now(timezone.utc)
    return now - timedelta(days=random.randint(0, days_back), minutes=random.randint(0, 24 * 60))


def payment_method():
    return random.choices(
        ["cash", "card", "bank_transfer", "mixed"],
        weights=[45, 35, 15, 5],
        k=1
    )[0]


def chunked(data, size=500):
    for i in range(0, len(data), size):
        yield data[i:i + size]


# -----------------------------
# Idempotency helpers
# -----------------------------
def ensure_products():
    existing = supabase.table("products").select("id,sku,name_ar,price").limit(1000).execute().data or []
    by_sku = {row["sku"]: row for row in existing if row.get("sku")}

    base_names = [
        "أرز بسمتي", "سكر أبيض", "زيت دوار الشمس", "حليب طويل الأجل", "شاي أسود",
        "قهوة عربية", "مياه معدنية", "عصير برتقال", "معجون أسنان", "شامبو",
        "صابون سائل", "مناديل ورقية", "دقيق أبيض", "مكرونة", "تونة",
        "جبنة شرائح", "لبن زبادي", "تمر خلاص", "بسكويت", "شوكولاتة"
    ]

    to_insert = []
    for i in range(PRODUCTS_COUNT):
        sku = f"SKU-{1000 + i}"
        if sku in by_sku:
            continue

        name = base_names[i % len(base_names)]
        price = q2(Decimal(str(random.uniform(3, 250))))
        cost = q2(price * Decimal(str(random.uniform(0.5, 0.85))))

        to_insert.append({
            "id": str(uuid4()),
            "sku": sku,
            "name": name,
            "name_ar": name,
            "description": f"منتج {name} عالي الجودة",
            "price": float(price),
            "cost": float(cost),
            "stock_qty": random.randint(10, 500),
            "is_active": True,
        })

    for batch in chunked(to_insert, 200):
        supabase.table("products").insert(batch).execute()

    final_rows = supabase.table("products").select("id,sku,name_ar,price").in_("sku", [f"SKU-{1000+i}" for i in range(PRODUCTS_COUNT)]).execute().data or []
    return final_rows


def ensure_customers():
    existing = supabase.table("customers").select("id,customer_code").limit(2000).execute().data or []
    existing_codes = {row["customer_code"] for row in existing if row.get("customer_code")}

    cities = ["الرياض", "جدة", "مكة", "المدينة", "الدمام", "الخبر", "الطائف", "أبها", "تبوك", "حائل"]
    to_insert = []

    for i in range(CUSTOMERS_COUNT):
        code = f"CUST-{10000 + i}"
        if code in existing_codes:
            continue

        to_insert.append({
            "id": str(uuid4()),
            "customer_code": code,
            "full_name_ar": fake.name(),
            "phone": random_saudi_phone(),
            "email": f"user{i+1}@example.com",
            "city": random.choice(cities),
            "address": fake.address().replace("\n", " "),
            "vat_number": "".join(str(random.randint(0, 9)) for _ in range(15)) if random.random() < 0.4 else None,
            "is_active": True,
        })

    for batch in chunked(to_insert, 200):
        supabase.table("customers").insert(batch).execute()

    final_rows = supabase.table("customers").select("id,customer_code").in_("customer_code", [f"CUST-{10000+i}" for i in range(CUSTOMERS_COUNT)]).execute().data or []
    return final_rows


def ensure_invoices_and_items(products, customers):
    # idempotency للفواتير عبر invoice_number الثابت
    existing_invoices = supabase.table("invoices").select("invoice_number").limit(5000).execute().data or []
    existing_numbers = {row["invoice_number"] for row in existing_invoices if row.get("invoice_number")}

    product_map = {p["id"]: p for p in products}
    product_ids = list(product_map.keys())
    customer_ids = [c["id"] for c in customers]

    invoices_to_insert = []
    items_to_insert = []

    year = datetime.now().year
    for i in range(INVOICES_COUNT):
        invoice_number = f"INV-{year}-{str(i+1).zfill(5)}"
        if invoice_number in existing_numbers:
            continue

        inv_id = str(uuid4())
        inv_date = random_invoice_date()

        subtotal = Decimal("0.00")
        vat_total = Decimal("0.00")
        grand_total = Decimal("0.00")

        line_count = random.randint(1, 5)
        chosen_products = random.sample(product_ids, k=min(line_count, len(product_ids)))

        for pid in chosen_products:
            p = product_map[pid]
            unit_price = Decimal(str(p["price"]))
            qty = Decimal(str(random.randint(1, 6)))
            discount = q2(Decimal(str(random.uniform(0, float(unit_price) * 0.15))))

            line_subtotal = q2((unit_price * qty) - discount)
            line_vat = q2(line_subtotal * (VAT_RATE / Decimal("100")))
            line_total = q2(line_subtotal + line_vat)

            subtotal += line_subtotal
            vat_total += line_vat
            grand_total += line_total

            items_to_insert.append({
                "id": str(uuid4()),
                "invoice_id": inv_id,
                "product_id": pid,
                "product_name_ar": p["name_ar"],
                "sku": p["sku"],
                "quantity": float(qty),
                "unit_price": float(unit_price),
                "discount_amount": float(discount),
                "line_subtotal": float(line_subtotal),
                "vat_rate": float(VAT_RATE),
                "vat_amount": float(line_vat),
                "line_total": float(line_total),
            })

        invoices_to_insert.append({
            "id": inv_id,
            "invoice_number": invoice_number,
            "customer_id": random.choice(customer_ids) if random.random() < 0.9 else None,
            "invoice_date": inv_date.isoformat(),
            "payment_method": payment_method(),
            "status": random.choices(["issued", "paid", "cancelled"], weights=[35, 55, 10], k=1)[0],
            "notes": "فاتورة تجريبية مولدة آلياً",
            "subtotal": float(q2(subtotal)),
            "vat_rate": float(VAT_RATE),
            "vat_amount": float(q2(vat_total)),
            "total_amount": float(q2(grand_total)),
        })

    # لازم ندخل invoices أولاً ثم invoice_items
    for batch in chunked(invoices_to_insert, 200):
        supabase.table("invoices").insert(batch).execute()

    for batch in chunked(items_to_insert, 500):
        supabase.table("invoice_items").insert(batch).execute()

    return len(invoices_to_insert), len(items_to_insert)


def main():
    print("Seeding started...")

    products = ensure_products()
    customers = ensure_customers()
    inv_count, item_count = ensure_invoices_and_items(products, customers)

    print(f"Products available: {len(products)}")
    print(f"Customers available: {len(customers)}")
    print(f"New invoices inserted: {inv_count}")
    print(f"New invoice items inserted: {item_count}")
    print("Seeding completed successfully.")


if __name__ == "__main__":
    main()