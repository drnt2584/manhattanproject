"""Shared building blocks for scenario rows.

Every statutory statement below was checked against the uploaded primary texts
(see data/sources_register.csv for the version of each Act reviewed).
"""

COLUMNS = [
    "Category", "Scenario", "Red_Book_Topic", "Law", "Act_Number", "Section",
    "Exact_Citation", "Source_Document", "Authority_Type", "Police_Power",
    "Required_Legal_Trigger", "Threshold_Type", "Acceptable_Reasons",
    "Examples_Of_Legitimate_Reasons", "Examples_Of_Insufficient_Reasons",
    "Police_Boundaries", "Police_May_Not_Do", "Citizen_Questions",
    "Verification_Steps", "How_To_Verify_Legality", "Required_Documents",
    "Need_Warrant", "Need_Arrest", "Need_Reasonable_Suspicion",
    "Need_Judicial_Approval", "Valid_Warrant_Requirements",
    "Indicators_Of_Invalid_Warrant", "Can_Refuse", "Can_Leave",
    "Evidence_To_Preserve", "Red_Flags", "Foreigner_Notes", "Escalation_Path",
    "Confidence_Level", "Research_Notes",
]

SEP = " | "

def j(*items):
    """Join list items with the dataset's intra-cell separator."""
    return SEP.join(i for i in items if i)

# --- Source document labels (match data/sources_register.csv) ---
SRC_FC = "Federal Constitution (Reprint as at 30 Nov 2025)"
SRC_CPC = "Criminal Procedure Code Act 593 (as at 1 Oct 2022)"
SRC_PA = "Police Act 1967 Act 344 (as at 10 May 2024)"
SRC_EA = "Evidence Act 1950 Act 56 (as at 1 Nov 2017)"
SRC_PC = "Penal Code Act 574 (as at 4 Jul 2023)"
SRC_DDA = "Dangerous Drugs Act 1952 Act 234 (as at 26 Nov 2025)"
SRC_CCA = "Computer Crimes Act 1997 Act 563 (as at 1 Dec 2011)"
SRC_AMLA = "AMLATFPUAA 2001 Act 613 (as at 1 Jul 2022)"
SRC_MACC = "MACC Act 2009 Act 694 (as at 1 Sep 2019)"
SRC_SOSMA = "SOSMA 2012 Act 747 (as at 1 Aug 2015) + Amendment Act A1736 (2024)"
SRC_RTA = "Road Transport Act 1987 Act 333 (as at 1 Apr 2019)"
SRC_RB = "Malaysian Bar Red Book: The Police and Your Basic Rights (May 2023)"
SRC_CMA = "Communications and Multimedia Act 1998 Act 588 - TEXT NOT SUPPLIED (only Act 589 MCMC Act supplied)"

# --- Reusable warrant text ---
WARRANT_VALID = j(
    "Issued by a Court/Magistrate identified on the face of the warrant (CPC s.54, s.56)",
    "In writing, signed as provided by Courts of Judicature Act 1964 or Subordinate Courts Act 1948 (CPC s.57(1))",
    "Bears the seal of the Court (CPC s.57(1))",
    "Date of issue and validity period in days stated (CPC s.57(2))",
    "Place to be searched identified; if restricted, the specific part only (CPC s.55)",
    "Thing/evidence sought and offence/investigation identified (CPC s.56)",
    "Directed to named officer(s) or Chief Police Officer (CPC s.54(3)-(4))",
    "Unit/lot number and address match the premises actually entered",
)
WARRANT_INVALID = j(
    "Address or unit number differs from premises entered",
    "No signature or no court seal",
    "No issuing court or Magistrate identified",
    "Validity period expired or absent",
    "Refusal to produce warrant on demand before entry (CPC s.59(1) links entry to production of the warrant)",
    "Search goes beyond the place or part specified (CPC s.55)",
    "Executed by persons not named/designated (CPC s.54(3)-(4))",
    "Items seized unrelated to the thing/offence named and no list given (CPC s.64-65)",
)
NO_WARRANT = "Not applicable - no warrant involved in this scenario"

# --- Reusable verification / escalation text ---
ID_CHECK = j(
    "Ask officer's name, rank and service number; note them",
    "Plain-clothes: ask for authority card (certificate of appointment, Police Act s.14); Red Book 1.1-1.2: red card = suspended officer, no authority",
    "Uniformed: read name tag and number (Red Book 1.3); note vehicle plate (Red Book 1.4)",
)
ESCALATION = j(
    "Lodge a police report at any station (CPC s.107) describing the conduct and officer identity",
    "Complain in writing to the Officer in Charge of Police District (OCPD) / State Police Contingent HQ",
    "Complain to Independent Police Conduct Commission (IPCC) - IPCC Act 2022 not among statutes reviewed; Requires Independent Verification",
    "Contact Bar Council Legal Aid Centre (Red Book front page lists LAC numbers)",
    "SUHAKAM complaint (Human Rights Commission of Malaysia Act 1999 not reviewed; Requires Independent Verification)",
    "Unlawful detention: habeas corpus application to High Court, Federal Constitution Art 5(2)",
    "Civil action for wrongful arrest / false imprisonment / trespass; criminal complaint under Penal Code ss.330, 341-342, 348 where applicable",
)
EVIDENCE_BASIC = j(
    "Officer name, rank, service number, authority card colour",
    "Date, time, exact location; patrol vehicle plate",
    "Names and contact details of witnesses",
    "Written contemporaneous notes (Red Book 3.3 'Personal Notes')",
    "Any photos/video lawfully taken by bystanders; medical report if injured",
    "Copies of any document handed over (order, warrant, seizure list, receipt)",
)
FOREIGNER_BASE = j(
    "Federal Constitution Art 5(3)-(4) rights (grounds, counsel, 24-hour production) apply to 'a person', not only citizens",
    "Art 5(4) proviso: a non-citizen arrested or detained under immigration law must be produced within 14 days, not 24 hours",
    "Art 5(5): clauses (3) and (4) do not apply to an enemy alien",
    "Consular notification (Vienna Convention on Consular Relations Art 36) is not found in any statute reviewed - Requires Independent Verification",
    "Carry passport/visa or a copy; Immigration Act 1959/63 not reviewed - Requires Independent Verification",
)

def row(**kw):
    """Fill defaults so every row has every column."""
    base = {c: "" for c in COLUMNS}
    base.update({
        "Valid_Warrant_Requirements": NO_WARRANT,
        "Indicators_Of_Invalid_Warrant": NO_WARRANT,
        "Escalation_Path": ESCALATION,
        "Foreigner_Notes": FOREIGNER_BASE,
    })
    base.update(kw)
    missing = [k for k in kw if k not in COLUMNS]
    if missing:
        raise KeyError(f"Unknown columns: {missing}")
    return base
