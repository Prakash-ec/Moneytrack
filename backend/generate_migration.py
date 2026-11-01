import os
os.chdir(r"d:\MoneyTrack\backend")
from alembic import command
from alembic.config import Config

c = Config("alembic.ini")
command.revision(c, autogenerate=True, msg="Add budget tables")
print("done")