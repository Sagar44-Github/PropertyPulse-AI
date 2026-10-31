"""Small additive schema upgrades for the local app's existing databases."""

from sqlalchemy import inspect

from .db import engine


def upgrade_existing_schema() -> None:
    """Add columns introduced after the first MVP without dropping user data."""
    inspector = inspect(engine)
    dialect = engine.dialect.name
    boolean_default = "FALSE" if dialect == "postgresql" else "0"
    additions = {
        "properties": {
            "is_demo": f"BOOLEAN NOT NULL DEFAULT {boolean_default}",
            "demo_key": "VARCHAR(120)",
        },
        "findings": {
            "origin": "VARCHAR(40) NOT NULL DEFAULT 'inspection'",
            "priority_override": "VARCHAR(40)",
            "priority_override_reason": "TEXT",
            "prediction_alternatives": "JSON",
        },
    }
    with engine.begin() as connection:
        for table, columns in additions.items():
            if table not in inspector.get_table_names():
                continue
            existing = {column["name"] for column in inspect(connection).get_columns(table)}
            for name, ddl in columns.items():
                if name not in existing:
                    connection.exec_driver_sql(f'ALTER TABLE "{table}" ADD COLUMN "{name}" {ddl}')
        if "properties" in inspect(connection).get_table_names():
            indexes = {index["name"] for index in inspect(connection).get_indexes("properties")}
            if "uq_properties_owner_demo_key" not in indexes:
                connection.exec_driver_sql(
                    'CREATE UNIQUE INDEX "uq_properties_owner_demo_key" ON "properties" ("owner_id", "demo_key")'
                )
