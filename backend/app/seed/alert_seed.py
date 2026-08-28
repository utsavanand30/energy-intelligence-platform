"""
alert_seed.py — seeds realistic alert rules and sample fired alerts.

Run:
    cd backend
    venv/bin/python -m app.seed.alert_seed
"""
import sys, os, random
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from datetime import datetime, timezone, timedelta
from app.core.database import SessionLocal
from app.models.alert import Alert, AlertRule, AlertType, AlertSeverity, AlertStatus
from app.models.meter import EnergyMeter
from app.models.machine import Machine
from app.models.reading import MeterReading
from sqlalchemy import func


# ── Default alert rule thresholds ─────────────────────────────────────
RULES = [
    # Power Factor
    {"name": "Low Power Factor (<0.85)",         "alert_type": AlertType.LOW_POWER_FACTOR,     "severity": AlertSeverity.WARNING,  "threshold_value": 0.85},
    {"name": "Critical Low Power Factor (<0.80)","alert_type": AlertType.LOW_POWER_FACTOR,     "severity": AlertSeverity.CRITICAL, "threshold_value": 0.80},
    # Voltage
    {"name": "High Voltage (>440V)",             "alert_type": AlertType.HIGH_VOLTAGE,         "severity": AlertSeverity.WARNING,  "threshold_max": 440.0},
    {"name": "Low Voltage (<380V)",              "alert_type": AlertType.LOW_VOLTAGE,          "severity": AlertSeverity.WARNING,  "threshold_min": 380.0},
    {"name": "Critical Low Voltage (<360V)",     "alert_type": AlertType.LOW_VOLTAGE,          "severity": AlertSeverity.CRITICAL, "threshold_min": 360.0},
    # Current
    {"name": "High Current (>500A)",             "alert_type": AlertType.HIGH_CURRENT,         "severity": AlertSeverity.WARNING,  "threshold_max": 500.0},
    {"name": "Critical High Current (>600A)",    "alert_type": AlertType.HIGH_CURRENT,         "severity": AlertSeverity.CRITICAL, "threshold_max": 600.0},
    # Demand
    {"name": "High Demand (>350 kW/machine)",    "alert_type": AlertType.HIGH_DEMAND,          "severity": AlertSeverity.WARNING,  "threshold_max": 350.0},
    # Imbalance
    {"name": "Voltage Imbalance (>3%)",          "alert_type": AlertType.VOLTAGE_IMBALANCE,    "severity": AlertSeverity.WARNING,  "threshold_value": 3.0},
    {"name": "Current Imbalance (>5%)",          "alert_type": AlertType.CURRENT_IMBALANCE,    "severity": AlertSeverity.WARNING,  "threshold_value": 5.0},
    # Communication
    {"name": "Meter Communication Failure",      "alert_type": AlertType.METER_COMM_FAILURE,   "severity": AlertSeverity.CRITICAL, "threshold_value": 300.0},  # 5 min
    {"name": "Missing Data (>10 min)",           "alert_type": AlertType.MISSING_DATA,         "severity": AlertSeverity.WARNING,  "threshold_value": 600.0},
    # Abnormal energy
    {"name": "Abnormal Energy (>30% above avg)", "alert_type": AlertType.ABNORMAL_ENERGY,      "severity": AlertSeverity.WARNING,  "threshold_value": 30.0},
    # Sudden load increase
    {"name": "Sudden Load Increase (>25% jump)", "alert_type": AlertType.SUDDEN_LOAD_INCREASE, "severity": AlertSeverity.WARNING,  "threshold_value": 25.0},
]


# ── Sample fired alerts scanned from historical data ───────────────────
SAMPLE_ALERT_TEMPLATES = [
    {
        "alert_type": AlertType.LOW_POWER_FACTOR,
        "severity": AlertSeverity.WARNING,
        "msg_template": "{machine} PF dropped to {value:.3f} (threshold 0.85)",
        "value_range": (0.78, 0.84),
        "threshold": 0.85,
    },
    {
        "alert_type": AlertType.LOW_POWER_FACTOR,
        "severity": AlertSeverity.CRITICAL,
        "msg_template": "{machine} critical low PF: {value:.3f} — check capacitor bank",
        "value_range": (0.70, 0.79),
        "threshold": 0.80,
    },
    {
        "alert_type": AlertType.HIGH_CURRENT,
        "severity": AlertSeverity.WARNING,
        "msg_template": "{machine} current exceeded 500A: {value:.1f}A on R-phase",
        "value_range": (501, 580),
        "threshold": 500.0,
    },
    {
        "alert_type": AlertType.VOLTAGE_IMBALANCE,
        "severity": AlertSeverity.WARNING,
        "msg_template": "{machine} voltage imbalance {value:.1f}% — check supply quality",
        "value_range": (3.1, 6.5),
        "threshold": 3.0,
    },
    {
        "alert_type": AlertType.METER_COMM_FAILURE,
        "severity": AlertSeverity.CRITICAL,
        "msg_template": "{machine} meter {meter} communication lost for {value:.0f}s",
        "value_range": (300, 1800),
        "threshold": 300.0,
    },
    {
        "alert_type": AlertType.HIGH_DEMAND,
        "severity": AlertSeverity.WARNING,
        "msg_template": "{machine} demand {value:.1f} kW exceeds threshold 350 kW",
        "value_range": (351, 420),
        "threshold": 350.0,
    },
    {
        "alert_type": AlertType.SUDDEN_LOAD_INCREASE,
        "severity": AlertSeverity.WARNING,
        "msg_template": "{machine} sudden load jump {value:.1f}% in 5 minutes",
        "value_range": (26, 45),
        "threshold": 25.0,
    },
    {
        "alert_type": AlertType.ABNORMAL_ENERGY,
        "severity": AlertSeverity.INFO,
        "msg_template": "{machine} energy consumption {value:.1f}% above 7-day average",
        "value_range": (31, 55),
        "threshold": 30.0,
    },
    {
        "alert_type": AlertType.MISSING_DATA,
        "severity": AlertSeverity.WARNING,
        "msg_template": "{machine} meter {meter} — missing readings for {value:.0f}s",
        "value_range": (600, 3600),
        "threshold": 600.0,
    },
]


def run():
    db = SessionLocal()
    try:
        # ── 1. Clear existing rules & alerts ──────────────────────────
        db.query(Alert).delete()
        db.query(AlertRule).delete()
        db.commit()
        print("Cleared existing alerts and rules.")

        # ── 2. Insert global alert rules ─────────────────────────────
        for rule_def in RULES:
            rule = AlertRule(
                name=rule_def["name"],
                alert_type=rule_def["alert_type"],
                severity=rule_def["severity"],
                threshold_value=rule_def.get("threshold_value"),
                threshold_min=rule_def.get("threshold_min"),
                threshold_max=rule_def.get("threshold_max"),
                enabled=True,
            )
            db.add(rule)
        db.commit()
        print(f"✓ Inserted {len(RULES)} alert rules.")

        # ── 3. Scan historical data and generate realistic alerts ─────
        machines = (
            db.query(Machine, EnergyMeter)
            .join(EnergyMeter, EnergyMeter.machine_id == Machine.id)
            .filter(EnergyMeter.enabled == True)
            .all()
        )

        now = datetime.now(timezone.utc)
        alerts_created = 0

        for machine, meter in machines:
            # Generate 1–4 realistic alerts per machine spread over 7 days
            n_alerts = random.choices([0, 1, 2, 3], weights=[20, 40, 30, 10])[0]
            for _ in range(n_alerts):
                tmpl = random.choice(SAMPLE_ALERT_TEMPLATES)
                value = random.uniform(*tmpl["value_range"])
                days_ago = random.uniform(0.1, 6.9)
                fired_at = now - timedelta(days=days_ago)

                msg = tmpl["msg_template"].format(
                    machine=machine.name,
                    meter=meter.identification,
                    value=value,
                )

                # Randomly resolve older alerts, keep recent ones active
                if days_ago > 1.0:
                    status = random.choice([AlertStatus.RESOLVED, AlertStatus.ACKNOWLEDGED])
                    resolved_at = fired_at + timedelta(minutes=random.randint(5, 120)) if status == AlertStatus.RESOLVED else None
                    ack_at = fired_at + timedelta(minutes=random.randint(2, 30))
                else:
                    status = AlertStatus.ACTIVE
                    resolved_at = None
                    ack_at = None

                alert = Alert(
                    meter_id=meter.id,
                    machine_id=machine.id,
                    alert_type=tmpl["alert_type"],
                    severity=tmpl["severity"],
                    status=status,
                    message=msg,
                    value=round(value, 3),
                    threshold=tmpl["threshold"],
                    fired_at=fired_at,
                    acknowledged_at=ack_at,
                    resolved_at=resolved_at,
                )
                db.add(alert)
                alerts_created += 1

        # ── 4. Always add a few ACTIVE critical alerts for dashboard demo ──
        critical_machines = random.sample(list(machines), min(4, len(machines)))
        critical_templates = [
            t for t in SAMPLE_ALERT_TEMPLATES
            if t["severity"] in (AlertSeverity.CRITICAL, AlertSeverity.WARNING)
        ]

        for machine, meter in critical_machines:
            tmpl = random.choice(critical_templates)
            value = random.uniform(*tmpl["value_range"])
            fired_at = now - timedelta(minutes=random.randint(5, 120))
            msg = tmpl["msg_template"].format(
                machine=machine.name, meter=meter.identification, value=value
            )
            alert = Alert(
                meter_id=meter.id,
                machine_id=machine.id,
                alert_type=tmpl["alert_type"],
                severity=tmpl["severity"],
                status=AlertStatus.ACTIVE,
                message=msg,
                value=round(value, 3),
                threshold=tmpl["threshold"],
                fired_at=fired_at,
            )
            db.add(alert)
            alerts_created += 1

        db.commit()
        print(f"✓ Generated {alerts_created} realistic alerts across {len(machines)} machines.")

        # ── Summary ───────────────────────────────────────────────────
        active   = db.query(Alert).filter(Alert.status == AlertStatus.ACTIVE).count()
        warning  = db.query(Alert).filter(Alert.severity == AlertSeverity.WARNING).count()
        critical = db.query(Alert).filter(Alert.severity == AlertSeverity.CRITICAL).count()
        print(f"\nAlert summary:")
        print(f"  Active   : {active}")
        print(f"  Warning  : {warning}")
        print(f"  Critical : {critical}")
        print(f"  Total    : {alerts_created}")
        print("\n✅ Alert seed complete.")

    except Exception as e:
        db.rollback()
        print(f"\n❌ Error: {e}")
        import traceback; traceback.print_exc()
    finally:
        db.close()


if __name__ == "__main__":
    run()
