import os
os.chdir(r"d:\MoneyTrack\backend")
from alembic.config import Config
c = Config("alembic.ini")
from alembic import command
command.upgrade(c, "head")
print("Migration applied successfully")