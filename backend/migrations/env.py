import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))     # so "import models" works
from logging.config import fileConfig
from alembic import context
import models as M

config = context.config
if config.config_file_name:                                       # only when run from the command line
    fileConfig(config.config_file_name, disable_existing_loggers=False)

if context.is_offline_mode():
    raise RuntimeError("Offline mode is not used in this project")

with M.engine.connect() as connection:
    context.configure(connection=connection, target_metadata=M.Base.metadata, compare_type=True)
    with context.begin_transaction():
        context.run_migrations()