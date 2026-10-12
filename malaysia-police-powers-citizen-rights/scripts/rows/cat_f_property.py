"""CATEGORY F - PROPERTY SEARCHES (scenarios 37-43)."""
from .common import *  # noqa: F401,F403

CAT = "F - Property Searches"

PREMISES_POWERS = j(
    "WITH WARRANT: CPC s.54 (court), s.56 (Magistrate, evidence of offence); DDA s.27(1) (Magistrate/JP); CCA s.10(1) (Magistrate, Inspector+); CMA s.247 (not reviewed)",
    "WITHOUT WARRANT: CPC s.116 (IO searching for a document/thing a s.51 order would not produce; officer must search in person if practicable, else written order to subordinate); CPC s.62 (Inspector+, stolen property, delay risk, informant's list and declaration, owner accompanies); CPC s.63 (CPO written authority, convicted receivers' premises); CPC s.116A (Inspector+, security/organized-crime offences, delay risk); DDA s.27(4) (Sub-Inspector+, drugs, delay risk); CCA s.10(2) (Inspector+, delay risk); AMLA s.31(1)(b) (investigating officer, reason to suspect AMLA offence); MACC s.31(1) (written order of PP/Chief Senior Assistant Commissioner) and s.31(3) (urgent)",
    "Common safeguards: list of all things seized signed by searching officer (CPC s.64); occupant or representative permitted to attend and receive copy of list (s.65); AMLA s.31(4)-(5) and MACC s.31 mirror this",
)
SEARCH_QUESTIONS = j(
    "Do you have a search warrant? Please show it before entering (CPC s.59(1))",
    "If no warrant: which section authorises entry without one, and what is the urgency?",
    "What exactly are you searching for and which offence/report?",
    "Which rooms/areas does the warrant cover? (CPC s.55)",
    "I wish to be present throughout (CPC s.65) - may I call a witness/lawyer?",
    "Please give me the signed list of items seized (CPC s.64-65)",
)
SEARCH_VERIFY = j(
    ID_CHECK,
    "Read the warrant: court, signature, seal, date, validity days, address/unit, thing sought, officers named",
    "Photograph the warrant if permitted; otherwise copy details",
    "Follow officers room to room; do not interfere; note every item taken",
    "Insist on the s.64 list before officers leave; check it item by item",
)
SEARCH_EVIDENCE = j(
    "Copy/photo of the warrant or written order",
    "Signed seizure list (s.64-65)",
    "Officer names/ranks; time of entry and exit",
    "Photos/video of premises before and after; damage",
    "Witness names (neighbours, co-occupants)",
    "CCTV/doorbell footage",
)

def premises_row(scenario, redbook, extra_law="", extra_section="", exact="", power_note="", triggers="",
                 legit="", insufficient="", boundaries="", maynot="", notes="", confidence="HIGH", foreigner=None):
    kw = dict(
        Category=CAT, Scenario=scenario, Red_Book_Topic=redbook,
        Law="Criminal Procedure Code; Federal Constitution" + ("; " + extra_law if extra_law else ""),
        Act_Number="Act 593" + ("; " + extra_section.split("::")[0] if "::" in extra_section else ""),
        Section="CPC ss.54-57, 59, 62-65, 116, 116A, 116B; FC Art 13(1)" + ("; " + (extra_section.split("::")[1] if "::" in extra_section else extra_section) if extra_section else ""),
        Exact_Citation=exact or "CPC s.56: Magistrate 'upon information and after such inquiry as he thinks necessary, has reason to believe that anything upon, by or in respect of which an offence has been committed, or any evidence or thing which is necessary to the conduct of an investigation into any offence, may be found in any place, he may, by warrant, authorize ... to enter ... and search the place ... and, if anything searched for is found, to seize it'. s.65: 'The occupant of the place searched, or some person in his behalf, shall in every instance be permitted to attend during the search'.",
        Source_Document=j(SRC_CPC, SRC_FC, SRC_RB), Authority_Type="Statute; Constitution",
        Police_Power=j(PREMISES_POWERS, power_note),
        Required_Legal_Trigger=triggers or "Warrant: Magistrate's reason to believe evidence/thing is in the place (s.56). Warrantless: the specific statutory conditions of s.116/s.62/s.116A/DDA s.27(4)/CCA s.10(2)/AMLA s.31/MACC s.31 must each be met - most require Inspector+ rank and a genuine risk that delay in obtaining a warrant would frustrate the search.",
        Threshold_Type="Reason to believe (Magistrate) / reasonable cause to suspect + delay-frustration (warrantless)",
        Acceptable_Reasons="Named offence under investigation | Specific evidence or thing believed on the premises | Stolen property reported with informant's declaration (s.62)",
        Examples_Of_Legitimate_Reasons=legit or "Warrant for stolen laptops at a specific unit after a report | Inspector enters without warrant where drugs are seen being moved out (DDA s.27(4))",
        Examples_Of_Insufficient_Reasons=insufficient or "'We just want to look around' | Warrant for a different address/unit | 'Routine check' of homes | Search beyond the rooms specified | No list of seized items",
        Police_Boundaries=j("Produce warrant on demand before entry to a closed place (s.59(1))", "Search only the place/part specified (s.55)", "Occupant or representative may attend throughout (s.65)", "List of all things seized and places found, signed; copy on request (s.64-65)", "Forcible entry only after notice of authority and purpose and demand of admittance (s.59(2) -> s.16(2))", "Access to computerised data by Inspector+ (s.116B)", boundaries),
        Police_May_Not_Do=j("Enter a closed dwelling without producing the warrant when demanded (s.59)", "Search areas outside the warrant's scope (s.55)", "Exclude the occupant from the search (s.65)", "Remove items without listing them (s.64)", "Seize property unrelated to the offence/investigation (FC Art 13(1)) - plain-view seizure limits Requires Case Law Review", maynot),
        Citizen_Questions=SEARCH_QUESTIONS, Verification_Steps=SEARCH_VERIFY,
        How_To_Verify_Legality="Check (1) warrant valid on its face and matching the premises, or a named warrantless power with its conditions explained; (2) occupant allowed to attend; (3) signed seizure list given. Failure on (1) makes the entry a trespass; failure on (2)-(3) is a procedural breach to record and raise.",
        Required_Documents="Search warrant (s.57 form) or written order (s.116(3)/MACC s.31(1)) or CPO authority (s.63); signed seizure list (s.64); copy to occupant (s.65)",
        Need_Warrant="Yes, unless a specific warrantless power applies", Need_Arrest="No", Need_Reasonable_Suspicion="Yes", Need_Judicial_Approval="Yes for warrant",
        Valid_Warrant_Requirements=WARRANT_VALID, Indicators_Of_Invalid_Warrant=WARRANT_INVALID,
        Can_Refuse="Cannot refuse entry under a valid warrant or lawful warrantless power (s.59(1) duty to allow ingress; refusal permits forcible entry and may be PC s.186 obstruction / DDA s.28 / AMLA s.34 / MACC s.48). May refuse consent-only searches where no power is cited and record the refusal.",
        Can_Leave="Persons present may be detained until the search is completed (s.17; DDA s.27(2)(d); AMLA s.31(2)(c)); otherwise free",
        Evidence_To_Preserve=SEARCH_EVIDENCE,
        Red_Flags="Warrant not shown | Wrong address/unit | Plain-clothes officers without authority cards | Items taken without list | Occupant locked out of rooms | 'Settlement' suggested",
        Confidence_Level=confidence,
        Research_Notes=j("Red Book does not address premises searches specifically.", notes),
    )
    if foreigner:
        kw["Foreigner_Notes"] = j(FOREIGNER_BASE, foreigner)
    return row(**kw)

ROWS = [
premises_row(
    "37. Search warrant execution (general)", "Not covered in Red Book",
    notes="Validity 'for a reasonable number of days to be specified' (s.57(2)); executable anywhere in Malaysia (s.57(3)); Magistrate may attend (s.60) or direct a search in his presence orally (s.61).",
),
premises_row(
    "38. House search (landed residence)", "Not covered in Red Book",
    legit="Warrant naming the house address after credible report that stolen goods are stored there | Pursuit of arrestee into the house (s.16) followed by separate warrant for evidence search",
    boundaries="Entry to arrest (s.16) does not itself authorise an evidence search of the whole house",
    notes="Distinguish: entry to arrest (s.16) vs. search for evidence (ss.54-65/s.116). After an arrest at home, a further search of the premises needs a warrant or s.116 justification - scope Requires Case Law Review.",
),
premises_row(
    "39. Condominium / apartment search", "Not covered in Red Book",
    insufficient="Warrant specifies the block only, not the unit | Officers search neighbouring units 'while here' | Management lets officers in without a warrant being shown to the occupant",
    boundaries="Unit number must match (s.55/s.56 'place'); common areas vs. private unit distinction - building management cannot consent to search of a private unit on the occupant's behalf (no such power in CPC; Requires Case Law Review)",
    maynot="Rely on management/security consent to enter a private unit without a warrant",
    notes="Third-party (management) consent to police entry has no statutory basis in the CPC - Requires Case Law Review.",
),
premises_row(
    "40. Rented premises search (tenant in occupation)", "Not covered in Red Book",
    insufficient="Landlord 'consents' and hands over keys while tenant is absent and no warrant exists | Warrant names the landlord's address elsewhere",
    boundaries="'Occupant' under s.65 is the person in occupation (tenant); the tenant or their representative must be permitted to attend | Landlord consent does not substitute for a warrant (no statutory basis)",
    maynot="Treat landlord's permission as authority to search a tenant's home",
    notes="Landlord consent and tenancy law interaction - Requires Case Law Review. Tenant should keep tenancy agreement to prove occupancy.",
),
premises_row(
    "41. Shared residence search (housemates / family)", "Not covered in Red Book",
    insufficient="Warrant relates to one housemate's room but officers search every bedroom | Searching a housemate's locked room or phone without them being named",
    boundaries="s.55 lets the court restrict the warrant to a 'particular place or part'; if restricted, only that part | Each occupant may attend the search of common areas (s.65) | Items seized from each room must be listed with location (s.64 'places in which they are respectively found')",
    maynot="Search parts of the residence excluded by a restricted warrant | Seize one occupant's property on the strength of suspicion against another without listing",
    notes="Scope of an unrestricted warrant over a shared home and co-occupants' privacy - Requires Case Law Review.",
    confidence="MEDIUM",
),
premises_row(
    "42. Office / business premises search", "Not covered in Red Book",
    extra_law="AMLA; MACC Act; Computer Crimes Act; Dangerous Drugs Act",
    extra_section="Act 613; Act 694; Act 563; Act 234::AMLA s.31, s.37; MACC s.30(1)(b), s.31, s.36; CCA s.10; DDA s.27(3)",
    exact="MACC s.31(1): PP or Chief Senior Assistant Commissioner+ 'upon information, and after such inquiry as he thinks necessary, that there is reasonable cause to suspect that in any place there is any evidence of the commission of an offence under this Act, he may by written order direct an officer of the Commission to (a) enter any premises and there search for, seize and take possession of, any book, document, record, account or data, or other article'. AMLA s.31(1)(b): investigating officer who 'is satisfied, or has reason to suspect' an AMLA offence may without warrant 'enter, inspect and search any premises belonging to or in the possession or control of the person or his employee'.",
    power_note="Business premises attract additional regimes: AMLA (warrantless, s.31), MACC (written order, s.31), CCA (warrant to Inspector+, s.10), DDA s.27(3) (licensed drug dealers' records, Sub-Inspector+). Production orders: CPC s.51; AMLA s.37; MACC s.30(1)(b).",
    legit="MACC written order for accounting records at a company office | AMLA investigating officer searches a money-changer's premises | CPC s.56 warrant for CCTV server after a theft",
    insufficient="'Inspection' of a business with no Act named | Taking every computer when the order names specific records | Refusing to let the manager attend",
    boundaries="AMLA s.31(4)-(5): list prepared and signed; occupant may attend; copy on request | MACC s.31 written order must be shown | Sealing in place where removal impracticable (AMLA s.31(2A)) | Consider a production order (CPC s.51; AMLA s.37) as the less intrusive route",
    maynot="Seize privileged legal documents without regard to privilege (Evidence Act s.126; MACC s.46 requires High Court order for advocates) | Disable business operations beyond what seizure requires",
    notes="Company should ask for the written order/warrant, identify a representative to attend, ask for sealed/duplicate images of data where possible (no statutory right to imaging - Practical Advice). Obstruction offences: AMLA s.34, s.37(3); MACC s.48; CCA s.11.",
    confidence="HIGH",
),
premises_row(
    "43. Hotel room search", "Not covered in Red Book",
    insufficient="Hotel staff open the room for police with no warrant and no urgency | Officers search luggage of a guest who is not named | 'Spot check' of rooms during a hotel raid with no premises warrant",
    boundaries="A hotel room in paying occupation is a 'place' for s.56; the guest is the 'occupant' entitled to attend (s.65) | Hotel's own access rights do not create police search authority (no statutory basis; Requires Case Law Review) | Raids on hotels commonly rely on DDA s.27(4)/CPC s.116A urgency - officers must articulate the urgency",
    maynot="Use hotel management's master key as a substitute for a warrant where no warrantless power is engaged | Search guests' persons without s.17/arrest basis",
    notes="Hotel guest's privacy vs. operator's access - Requires Case Law Review. Immigration Act hotel-register checks (not reviewed) may apply to foreigners.",
    confidence="MEDIUM",
    foreigner="Hotel guests who are foreign nationals may face passport checks under Immigration Act 1959/63 (not reviewed) - Requires Independent Verification; keep passport available and request consular contact if detained",
),
]
