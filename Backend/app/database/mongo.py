from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv

load_dotenv()

uri = os.getenv("MONGODB_URI")
db_name = os.getenv("MONGODB_NAME", "DataAgenda")

if not uri:
    raise RuntimeError("MONGODB_URI no está definida en .env")

client = AsyncIOMotorClient(uri)
db = client[db_name]
collection_auth = db["users_auth"]
collection_estilista = db["stylist"]
collection_admin_sede = db["users_auth"]
collection_admin_franquicia = db["admin_franquicia"]
collection_horarios = db["stylist_schedules"]
collection_block = db["block"]
collection_citas = db["appointments"]
collection_clients = db["clients"]
collection_servicios = db["services"]
collection_locales = db["branch"]
collection_productos = db["products"]
collection_pedidos = db["orders"]
collection_salidas = db["exits"]
collection_card = db["fichas"]
collection_commissions = db["commissions"]
collection_products = db["products"]
collection_invoices = db["invoices"]  # Nueva colección
collection_sales = db["sales"]  
collection_inventarios = db["inventary"]  # Nueva colección
collection_inventory_motions = db["inventory_motions"]  # Nueva colección
collection_cash_expenses = db["cash_expenses"]
collection_cash_ingresos = db["cash_ingresos"]
collection_cash_closures = db["cash_closures"]
collection_giftcards = db["giftcards"]
def connect_to_mongo():
    pass
