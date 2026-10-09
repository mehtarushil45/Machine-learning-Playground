"""Generate synthetic, license-clean pitfall datasets for ML learning.

Each dataset includes:
- A real-world educational story
- A defined target column
- A documented pitfall mechanism
- A pre-training hint
- A post-training reveal
- Fully documented mathematical generating process with fixed random seeds.
"""

import os
import json
import numpy as np
import pandas as pd

OUTPUT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "services", "api", "uploads", "pitfalls"))
METADATA_FILE = os.path.join(OUTPUT_DIR, "catalog.json")


def generate_churn_leakage(n: int = 1000, seed: int = 42) -> pd.DataFrame:
    """Story: Predict customer churn before subscription renewal.
    
    Generating Process:
    - Base features: tenure (1-72 mos), monthly_charges ($20-$120), support_tickets (0-8)
    - True churn probability logit = -1.5 - 0.03*tenure + 0.02*monthly_charges + 0.3*support_tickets
    - Pitfall (Target Leakage): cancellation_fee_billed is generated conditional on churn=1 ($50-$150)
      and 0 for churn=0. This feature only exists AFTER churn occurs.
    """
    rng = np.random.RandomState(seed)
    tenure = rng.randint(1, 73, size=n)
    monthly_charges = np.round(rng.uniform(20.0, 120.0, size=n), 2)
    support_tickets = rng.poisson(lam=1.5, size=n)
    
    logit = -1.5 - 0.03 * tenure + 0.02 * monthly_charges + 0.3 * support_tickets
    prob = 1.0 / (1.0 + np.exp(-logit))
    churn = (rng.uniform(0, 1, size=n) < prob).astype(int)
    
    # Leakage column: fee billed after cancellation
    cancellation_fee_billed = np.where(
        churn == 1,
        np.round(rng.uniform(45.0, 150.0, size=n), 2),
        0.0
    )
    # Categorical proxy leakage: exit interview note
    exit_interview_status = np.where(
        churn == 1,
        rng.choice(["completed_exit", "refused_exit"], size=n, p=[0.8, 0.2]),
        "not_applicable"
    )
    
    df = pd.DataFrame({
        "tenure_months": tenure,
        "monthly_charges": monthly_charges,
        "support_tickets": support_tickets,
        "contract_type": rng.choice(["Month-to-month", "One year", "Two year"], size=n, p=[0.5, 0.3, 0.2]),
        "cancellation_fee_billed": cancellation_fee_billed,
        "exit_interview_status": exit_interview_status,
        "churn": churn,
    })
    return df


def generate_credit_imbalance(n: int = 2000, seed: int = 101) -> pd.DataFrame:
    """Story: Detect rare loan defaults in retail banking.
    
    Generating Process:
    - Base features: credit_score (500-850), debt_to_income (0.05-0.65), annual_income ($25k-$200k)
    - True default rate is calibrated to exactly 5.0% (95/5 severe imbalance).
    - Pitfall: A model predicting 0 for all instances achieves 95% accuracy while failing completely.
    """
    rng = np.random.RandomState(seed)
    credit_score = rng.normal(loc=710, scale=60, size=n).clip(500, 850).round()
    annual_income = np.round(rng.lognormal(mean=11.0, sigma=0.5, size=n), 2).clip(25000, 250000)
    debt_to_income = np.round(rng.uniform(0.05, 0.65, size=n), 3)
    
    # Latent risk score
    risk = -(credit_score - 700) / 50.0 + (debt_to_income - 0.3) * 5.0 - (annual_income - 60000) / 40000.0
    threshold = np.percentile(risk, 95.0)  # Top 5% default
    loan_default = (risk >= threshold).astype(int)
    
    df = pd.DataFrame({
        "credit_score": credit_score.astype(int),
        "annual_income": annual_income,
        "debt_to_income": debt_to_income,
        "employment_years": rng.randint(0, 30, size=n),
        "loan_amount": np.round(rng.uniform(3000, 40000, size=n), 2),
        "loan_default": loan_default,
    })
    return df


def generate_housing_multicollinearity(n: int = 1200, seed: int = 202) -> pd.DataFrame:
    """Story: Predict residential property prices from spatial dimensions.
    
    Generating Process:
    - True generating relationship: price = 50000 + 210 * sqft_living + 15000 * bedrooms + noise
    - Pitfall: sq_meters_living is a deterministic conversion of sqft_living (sqft * 0.092903),
      and total_rooms is virtually identical to sum of bedrooms and bathrooms.
    - High correlation (|r| > 0.99) causes severe coefficient instability in linear regressions.
    """
    rng = np.random.RandomState(seed)
    sqft_living = rng.randint(600, 4500, size=n)
    sq_meters_living = np.round(sqft_living * 0.092903, 2)
    bedrooms = rng.choice([1, 2, 3, 4, 5], size=n, p=[0.05, 0.25, 0.45, 0.20, 0.05])
    bathrooms = (bedrooms * 0.75 + rng.choice([0.0, 0.5, 1.0], size=n)).round(1)
    total_rooms = bedrooms + bathrooms.astype(int)
    
    price = 50000 + 210 * sqft_living + 15000 * bedrooms + rng.normal(0, 15000, size=n)
    price = np.round(price, 2)
    
    df = pd.DataFrame({
        "sqft_living": sqft_living,
        "sq_meters_living": sq_meters_living,
        "bedrooms": bedrooms,
        "bathrooms": bathrooms,
        "total_rooms": total_rooms,
        "lot_size_sqft": rng.randint(2000, 15000, size=n),
        "house_price": price,
    })
    return df


def generate_hospital_simpsons_paradox(n: int = 1500, seed: int = 303) -> pd.DataFrame:
    """Story: Compare clinical recovery between Treatment A and Treatment B.
    
    Generating Process:
    - Confounder: initial condition severity (Mild vs Severe).
    - In Mild patients: Treatment A recovers 85%, Treatment B recovers 75% (A is better).
    - In Severe patients: Treatment A recovers 40%, Treatment B recovers 30% (A is better).
    - Allocation Confounding: Treatment B was given to 80% mild and 20% severe patients.
      Treatment A was given to 20% mild and 80% severe patients.
    - Aggregated recovery: Treatment B appears higher overall (0.8*0.75 + 0.2*0.3 = 66%)
      than Treatment A (0.2*0.85 + 0.8*0.4 = 49%), inverting the causal truth.
    """
    rng = np.random.RandomState(seed)
    
    # 750 patients assigned to Treatment A, 750 to Treatment B
    treatments = ["Treatment A"] * (n // 2) + ["Treatment B"] * (n // 2)
    rng.shuffle(treatments)
    
    severities = []
    recovered = []
    
    for t in treatments:
        if t == "Treatment A":
            # 80% severe, 20% mild
            sev = "Severe" if rng.rand() < 0.80 else "Mild"
        else:
            # 20% severe, 80% mild
            sev = "Severe" if rng.rand() < 0.20 else "Mild"
        severities.append(sev)
        
        # Recovery rates conditional on treatment & severity
        if sev == "Mild":
            rate = 0.85 if t == "Treatment A" else 0.75
        else:
            rate = 0.40 if t == "Treatment A" else 0.30
            
        recovered.append(int(rng.rand() < rate))
        
    df = pd.DataFrame({
        "treatment_group": treatments,
        "patient_age": rng.randint(20, 80, size=n),
        "condition_severity": severities,
        "hospital_stay_days": rng.randint(2, 14, size=n),
        "patient_recovered": recovered,
    })
    return df


def generate_ecommerce_identifier(n: int = 1000, seed: int = 404) -> pd.DataFrame:
    """Story: Identify shoppers likely to make repeat transactions.
    
    Generating Process:
    - Account sequence IDs were created chronologically. Older accounts (smaller ID numbers)
      had more time to make repeat purchases, creating a strong spurious correlation between
      account_seq_id and repeat_purchase.
    - Pitfall: Using account_seq_id as a feature learns database auto-increment keys rather
      than customer preferences.
    """
    rng = np.random.RandomState(seed)
    account_seq_id = np.arange(10001, 10001 + n)
    
    # Real behavioral signals
    avg_session_mins = np.round(rng.gamma(shape=2.0, scale=4.0, size=n), 1)
    cart_additions = rng.poisson(lam=3.0, size=n)
    
    # Spurious correlation with chronological ID
    prob = 0.85 - 0.0006 * (account_seq_id - 10001) + 0.03 * cart_additions
    prob = np.clip(prob, 0.05, 0.95)
    repeat_purchase = (rng.rand(n) < prob).astype(int)
    
    df = pd.DataFrame({
        "account_seq_id": account_seq_id,
        "customer_uuid": [f"usr_{rng.randint(100000, 999999)}" for _ in range(n)],
        "avg_session_mins": avg_session_mins,
        "cart_additions": cart_additions,
        "device_category": rng.choice(["Mobile", "Desktop", "Tablet"], size=n, p=[0.6, 0.35, 0.05]),
        "repeat_purchase": repeat_purchase,
    })
    return df


def generate_medical_mnar(n: int = 1000, seed: int = 505) -> pd.DataFrame:
    """Story: Predict diabetes diagnosis from screening measurements.
    
    Generating Process:
    - Target: diabetes_positive (0 or 1)
    - Feature: oral_glucose_fasting_mgdl is missing NOT at random (MNAR). Patients in acute
      distress or with known severe complications were immediately referred to emergency care
      and did not sit through the 8-hour fasting blood draw.
    - Pitfall: Imputing missing values with the median assumes missingness is completely at
      random (MCAR), which severely underestimates diabetic risk for missing records.
    """
    rng = np.random.RandomState(seed)
    age = rng.randint(25, 75, size=n)
    bmi = np.round(rng.normal(loc=28.0, scale=5.0, size=n), 1).clip(18.0, 50.0)
    systolic_bp = rng.normal(loc=125, scale=15, size=n).round().astype(int)
    
    # Latent diabetes risk
    risk = -4.0 + 0.04 * age + 0.08 * bmi + 0.01 * systolic_bp
    prob = 1.0 / (1.0 + np.exp(-risk))
    diabetes_positive = (rng.rand(n) < prob).astype(int)
    
    # True glucose values
    glucose = np.where(
        diabetes_positive == 1,
        rng.normal(loc=160, scale=25, size=n),
        rng.normal(loc=95, scale=15, size=n)
    ).round(1)
    
    # MNAR: Severe diabetic patients (glucose > 175) have 70% probability of missing test
    missing_mask = (glucose > 175) & (rng.rand(n) < 0.70)
    glucose_observed = np.where(missing_mask, np.nan, glucose)
    
    df = pd.DataFrame({
        "age": age,
        "bmi": bmi,
        "systolic_bp": systolic_bp,
        "family_history": rng.choice(["Yes", "No"], size=n, p=[0.3, 0.7]),
        "oral_glucose_fasting_mgdl": glucose_observed,
        "diabetes_positive": diabetes_positive,
    })
    return df


DATASET_CATALOG = [
    {
        "id": "story-churn-leakage",
        "filename": "story_churn_leakage.csv",
        "title": "Telecom Churn: The Post-Cancellation Trap",
        "story": "Predict whether a telecommunications subscriber will cancel their subscription before next month's billing cycle.",
        "target": "churn",
        "problem_type": "classification",
        "pitfall_type": "target_leakage",
        "pitfall_name": "Target Leakage",
        "hint": "Examine feature names and distributions closely: would all of these columns actually be available in the CRM before the customer decides to churn?",
        "reveal": "Features 'cancellation_fee_billed' and 'exit_interview_status' only occur after a cancellation event has already taken place. Training with them creates artificial 99%+ accuracy that catastrophically fails in real production.",
        "row_count": 1000,
        "generator_func": generate_churn_leakage,
    },
    {
        "id": "story-credit-imbalance",
        "filename": "story_credit_imbalance.csv",
        "title": "Credit Risk: The 95% Accuracy Illusion",
        "story": "Detect high-risk retail banking borrowers who will default on their credit commitments.",
        "target": "loan_default",
        "problem_type": "classification",
        "pitfall_type": "class_imbalance",
        "pitfall_name": "Severe Class Imbalance",
        "hint": "Check the class ratio of the target column. What accuracy would a brainless model get if it predicted 'No Default' for every customer?",
        "reveal": "95% of records are non-defaults. A naive majority-class baseline achieves 95.0% accuracy with zero predictive ability. Evaluating using Accuracy hides complete failure to detect defaulting borrowers; use PR-AUC, Recall, or Balanced Accuracy instead.",
        "row_count": 2000,
        "generator_func": generate_credit_imbalance,
    },
    {
        "id": "story-housing-multicollinearity",
        "filename": "story_housing_multicollinearity.csv",
        "title": "Real Estate: Redundant Measurements",
        "story": "Predict home valuations using architectural and spatial measurements.",
        "target": "house_price",
        "problem_type": "regression",
        "pitfall_type": "multicollinearity",
        "pitfall_name": "Severe Multicollinearity",
        "hint": "Compare correlation matrices across independent features before model fitting. Are any features measuring the same physical dimension?",
        "reveal": "'sqft_living' and 'sq_meters_living' are exact mathematical conversions of each other (|r| = 1.0). In linear models, this causes singular covariance matrices and erratic coefficients with inflated standard errors.",
        "row_count": 1200,
        "generator_func": generate_housing_multicollinearity,
    },
    {
        "id": "story-hospital-simpsons-paradox",
        "filename": "story_hospital_simpsons_paradox.csv",
        "title": "Clinical Trials: Simpson's Confounding Paradox",
        "story": "Evaluate which treatment protocol yields superior recovery rates for hospitalized patients.",
        "target": "patient_recovered",
        "problem_type": "classification",
        "pitfall_type": "simpsons_paradox",
        "pitfall_name": "Simpson's Paradox (Omitted Confounder)",
        "hint": "Does Treatment A outperform Treatment B across all demographic and illness subgroups, or does aggregate grouping tell a different story?",
        "reveal": "Treatment A actually achieves higher recovery rates for both Mild and Severe patients. However, Treatment B was assigned mostly to Mild cases (80%), making its aggregate recovery look higher. Controlling for condition severity reverses the apparent conclusion.",
        "row_count": 1500,
        "generator_func": generate_hospital_simpsons_paradox,
    },
    {
        "id": "story-ecommerce-identifier",
        "filename": "story_ecommerce_identifier.csv",
        "title": "E-Commerce: The Auto-Increment ID Trap",
        "story": "Identify shoppers likely to make repeat purchases using browsing telemetry.",
        "target": "repeat_purchase",
        "problem_type": "classification",
        "pitfall_type": "identifier_column",
        "pitfall_name": "Identifier Column as Feature",
        "hint": "Check high-cardinality keys: should database primary keys or auto-incrementing customer IDs be fed into your model?",
        "reveal": "'account_seq_id' was an auto-incremented database index that chronologically correlated with user registration dates. Tree models easily split on this key, achieving deceptive training performance that completely fails on newly registered users.",
        "row_count": 1000,
        "generator_func": generate_ecommerce_identifier,
    },
    {
        "id": "story-medical-mnar",
        "filename": "story_medical_mnar.csv",
        "title": "Metabolic Clinic: Missing Not At Random (MNAR)",
        "story": "Predict diabetes risk from routine clinical and blood panel screenings.",
        "target": "diabetes_positive",
        "problem_type": "classification",
        "pitfall_type": "missing_pattern",
        "pitfall_name": "Non-Random Missing Data (MNAR)",
        "hint": "Analyze which patients have missing values in the fasting glucose test. Is the missingness truly random or tied to patient condition?",
        "reveal": "Patients with acute symptoms were excused from the 8-hour fasting test to receive immediate care. Imputing with the median (95 mg/dL) misclassifies severely ill patients as healthy, because missingness itself conveys diagnostic information.",
        "row_count": 1000,
        "generator_func": generate_medical_mnar,
    },
]


def generate_all_datasets():
    """Generate all pitfall CSVs and the catalog.json manifest."""
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    catalog_summary = []
    
    for item in DATASET_CATALOG:
        filename = item["filename"]
        target_path = os.path.join(OUTPUT_DIR, filename)
        generator = item["generator_func"]
        df = generator(n=item["row_count"])
        df.to_csv(target_path, index=False)
        print(f"Generated {filename}: {df.shape[0]} rows, {df.shape[1]} cols -> {target_path}")
        
        meta = {
            "id": item["id"],
            "filename": item["filename"],
            "title": item["title"],
            "story": item["story"],
            "target": item["target"],
            "problem_type": item["problem_type"],
            "pitfall_type": item["pitfall_type"],
            "pitfall_name": item["pitfall_name"],
            "hint": item["hint"],
            "reveal": item["reveal"],
            "row_count": item["row_count"],
            "columns": list(df.columns),
        }
        catalog_summary.append(meta)
        
    with open(METADATA_FILE, "w", encoding="utf-8") as f:
        json.dump(catalog_summary, f, indent=2)
    print(f"Saved catalog metadata to {METADATA_FILE}")


if __name__ == "__main__":
    generate_all_datasets()
