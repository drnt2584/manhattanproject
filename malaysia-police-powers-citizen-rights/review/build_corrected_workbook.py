#!/usr/bin/env python3
"""Build the corrected full workbook.

Base: the original reviewed workbook (all tabs, original sheet names, headers, IDs, hashes).
Overlay: the reviewer's updated entries from updated_tabs.xls (converted) for Provisions,
Calculator and Sources & currency, with QA corrections applied. Items that cannot be
verified against the supplied sources are left as explicit placeholders for the reviewer.

Usage: python3 build_corrected_workbook.py <original.xlsx> <updated_converted.xlsx> <out.xlsx>
"""
import sys
from openpyxl import load_workbook
from openpyxl.styles import Alignment, Font, PatternFill

CHECK_DATE = "2026-10-13"
CHECKED_BY = "Kamal Yusof (reviewer), 13 Oct 2026. QA corrections applied 13 Oct 2026; reviewer to confirm items marked [REVIEWER TO CONFIRM]."
GAZ = "[REVIEWER TO CONFIRM: P.U.(B) notification number and date]"

# ---------------------------------------------------------------- Provisions
# Full replacement notes where the reviewer's updated note was wrong or incomplete.
PROV_NOTES = {
    "prv.fc_art5": "1. Transcription: Matches reprint word-for-word; OCR artefact '(I)' for '(1)' in clause (4). 2. Page: Reference correct (PDF index p.14; printed page 21-22. The Federal Constitution rows use the PDF page index, the statute rows use printed page numbers). 3. Currency: Reprint as at 30 Nov 2025 (latest amendment Act A1663); no later amendment identified as at 13 Oct 2026.",
    "prv.cpc_s28": "1. Transcription: Matches reprint word-for-word. 2. Page: Page reference in pack (p.39) is incorrect; CORRECTED PAGE REFERENCE is criminal procedure code reprint 2022.pdf p.41 (s.27(6) and s.28 both begin under the page-41 header; p.39 holds s.24). 3. Currency: Current text as at 2022 reprint; subsequent CPC amendments (Act A1682, Act A1722) do not touch s.28.",
    "prv.cpc_sch4": "1. Transcription: Matches Fourth Schedule text word-for-word; OCR glitches: 'PART!' for 'PART I', '(I)' for '(1)', '(J)' for '(j)', 'beg' for 'bag'. 2. Page: Reference p.373 is the PDF index (printed page 343). 3. Currency: Current text as at 2022 reprint; subsequent CPC amendments do not touch the Fourth Schedule; no Ministerial order under s.20A(3) amending the Schedule identified as at 13 Oct 2026.",
    "prv.cpc_s116b": "1. Transcription: Matches reprint word-for-word. The cell also carries the shoulder note and opening words of s.116C ('Interception of communication ... 116c. (1) Notwithstanding any writt'); trim to s.116B. OCR: 'admis.sibility'. 2. Page: Reference correct (criminal procedure code reprint 2022.pdf p.85). 3. Currency: Current text as at 2022 reprint; subsequent CPC amendments (Act A1682, Act A1722) do not touch s.116B.",
    "prv.cpc_s117": "1. Transcription: Matches reprint word-for-word; OCR glitches 'immediate! y' for 'immediately' and '(IA)' for '(1A)'. 2. Page: Reference correct (criminal procedure code reprint 2022.pdf p.87). 3. Currency: Current text as at 2022 reprint; subsequent CPC amendments (Act A1682, Act A1722) do not touch s.117.",
    "prv.pa_s14": "1. Transcription: Matches Police Act 1967 reprint word-for-word. 2. Page: Reference correct (Police Act Reprint 2024.pdf p.17). 3. Currency: Reprint as at 10 May 2024 already incorporates Act A1705 (2024). No later amending Act identified in the supplied sources; any 2025 amendment [REVIEWER TO CONFIRM: Act number, or delete] does not touch s.14.",
    "prv.pa_s20": "1. Transcription: Matches Police Act 1967 reprint word-for-word. 2. Page: Reference correct (Police Act Reprint 2024.pdf p.19). 3. Currency: Reprint as at 10 May 2024 already incorporates Act A1705 (2024). No later amending Act identified in the supplied sources; any 2025 amendment [REVIEWER TO CONFIRM: Act number, or delete] does not touch s.20.",
    "prv.pa_s24": "1. Transcription: Matches Police Act 1967 reprint word-for-word. 2. Page: Reference correct (Police Act Reprint 2024.pdf p.23). 3. Currency: Reprint as at 10 May 2024 already incorporates Act A1705 (2024). No later amending Act identified in the supplied sources; any 2025 amendment [REVIEWER TO CONFIRM: Act number, or delete] does not touch s.24.",
    "prv.pa_s26": "1. Transcription: Matches Police Act 1967 reprint word-for-word; OCR 'as. he'. Penalty figure reflects Act A1705 (2024) per the reprint's footnote. 2. Page: Reference correct (Police Act Reprint 2024.pdf p.26). 3. Currency: Reprint as at 10 May 2024 already incorporates Act A1705. No later amending Act identified in the supplied sources; any 2025 amendment [REVIEWER TO CONFIRM: Act number, or delete] does not touch s.26.",
    "prv.rta_s55": "1. Transcription: Matches Road Transport Act 1987 reprint word-for-word. 2. Page: Reference correct (Road Transport Act.pdf p.86). 3. Currency: Text as at 1 Apr 2019 reprint. Later amendments: Act A1623 (in force Oct 2020 per reviewer; not among supplied sources, LOM reference [REVIEWER TO CONFIRM]) and Act A1794 (2026, not yet in force) do not touch s.55.",
    "prv.rta_s58": "1. Transcription: Matches Road Transport Act 1987 reprint word-for-word; OCR 'itssued' for 'issued', 'certitficate' for 'certificate'. 2. Page: Reference correct (Road Transport Act.pdf p.89). 3. Currency: Text as at 1 Apr 2019 reprint. Later amendments (Act A1623; Act A1794 not yet in force) do not touch s.58 [LOM reference for A1623: REVIEWER TO CONFIRM].",
    "prv.rta_s78": "1. Transcription: Matches Road Transport Act 1987 reprint word-for-word; OCR ']Place' for 'place'. 2. Page: Page reference in pack (p.57) is incorrect; CORRECTED PAGE REFERENCE is Road Transport Act.pdf p.128-129 (s.78(1) begins on p.128 and runs onto p.129). 3. Currency: Text as at 1 Apr 2019 reprint. Later amendments (Act A1623; Act A1794 not yet in force) do not touch s.78 [LOM reference for A1623: REVIEWER TO CONFIRM].",
    "prv.rta_s112": "1. Transcription: Matches Road Transport Act 1987 reprint word-for-word; OCR 'm Malaysia' for 'in Malaysia'. 2. Page: Reference correct (Road Transport Act.pdf p.169). 3. Currency: Text as at 1 Apr 2019 reprint is the text in force. Road Transport (Amendment) Act 2026 (Act A1794) amends the s.112(1)(a) offence list but is not yet in force [commencement: REVIEWER TO CONFIRM with Gazette reference when notified]. Watch-list item.",
    "prv.rta_s123": "1. Transcription: Matches Road Transport Act 1987 reprint word-for-word. 2. Page: Reference correct (Road Transport Act.pdf p.184). 3. Currency: Text as at 1 Apr 2019 reprint. Later amendments (Act A1623; Act A1794 not yet in force) do not touch s.123 [LOM reference for A1623: REVIEWER TO CONFIRM].",
    "prv.sosma_s4": "1. Transcription: Matches SOSMA 2012 reprint (as at 1 Aug 2015) word-for-word. 2. Page: Reference correct (SOSMA.pdf p.9). 3. Currency: Security Offences (Special Measures) (Amendment) Act 2024 (Act A1736) contains one operative provision, deleting s.19; it does not touch s.4. Note for the Calculator: s.4(5) lapses unless renewed by resolution of both Houses every five years (s.4(11)); date of the last extending resolution [REVIEWER TO CONFIRM].",
    "prv.sosma_s5": "1. Transcription: Matches SOSMA 2012 reprint word-for-word; OCR '( 1 )(b)'. 2. Page: Reference correct (SOSMA.pdf p.11). 3. Currency: Act A1736 (2024) deletes s.19 only; s.5 unchanged.",
    "prv.cca_s5": "1. Transcription: Matches Computer Crimes Act 1997 reprint word-for-word. 2. Page: Page reference in pack (p.3) is incorrect; CORRECTED PAGE REFERENCE is Compute Crimes Act.pdf p.10-11 (ss.3-4 are on p.9; s.5 begins on p.10 and runs onto p.11). 3. Currency: Current text as at 1 Dec 2011 reprint; the reprint records no amendments; none identified as at 13 Oct 2026.",
    "prv.cca_s11": "1. Transcription: Matches Computer Crimes Act 1997 reprint word-for-word; OCR 'ifhe' for 'if he'. 2. Page: Page reference in pack (p.9) is incorrect; CORRECTED PAGE REFERENCE is Compute Crimes Act.pdf p.14 (s.10(3) and s.11 are under the page-14 header). 3. Currency: Current text as at 1 Dec 2011 reprint; no amendments.",
    "prv.cma_s249": "1. Transcription: Matches the Communications and Multimedia Act 1998 text in the 2006 reprint word-for-word. 2. Page: Reference correct (Communications and Multimedia Act 1998.pdf p.130). 3. Currency: NOT CONFIRMED. The Communications and Multimedia (Amendment) Act 2025 (Act A1743; Royal Assent 27 Jan 2025) post-dates the reprint and commences by Gazette notification, possibly in parts. Two conflicting statements were made in successive reviews (commenced 11 Feb 2025 under P.U.(B) 61/2025; not yet commenced). Before this row can be Approved the reviewer must state (a) whether A1743 amends s.249 at all and (b) if so, the commencement date for that section with its Gazette reference [REVIEWER TO CONFIRM]. Verdict stays Amend until then.",
}

# ---------------------------------------------------------------- Calculator
CALC_NOTES = {
    ("Regime: security", None): "Confirmed. Section relied on: SOSMA 2012 s.4(5), read with s.4(4) and s.4(10) (which gives s.4 effect notwithstanding FC Art 5 and CPC s.117). Caveats for the model: (i) extension to a maximum of 28 days requires authorisation by an officer of Superintendent rank or above; (ii) s.4(5) lapses unless renewed by resolution of both Houses every five years (s.4(11)). Renewal status as at 13 Oct 2026: [REVIEWER TO CONFIRM: date of the most recent extending resolution]. Until confirmed, the calculator should display the 28-day regime with a 'renewal status unverified' warning. (iii) s.5(2): lawyer access may be delayed up to 48 hours by a Superintendent or above.",
    ("OPEN QUESTION", "How remand days are counted (calendar days or 24-hour periods)."): "1. What the statute says: CPC s.117(2) expresses the limits in 'days' and defines nothing; the 24-hour limit in s.28(3) and FC Art 5(4) is a separate clock expressed in hours. 2. Authority relied on: Interpretation Acts 1948 and 1967 (Act 388), s.54 (computation of time). Act 388 was not among the sources supplied to this project; the subsection relied on must be quoted here so the assumption below can be checked against it [REVIEWER TO CONFIRM: quote s.54(1)]. No reported case on the computation of s.117 remand days was identified. 3. Calculator assumption (labelled as an assumption, not as settled law): remand orders run in calendar days, expiring at the end of the final day stated in the order, rather than in rolling 24-hour blocks from the time of the order.",
    ("OPEN QUESTION", "How a part-day is treated."): "1. What the statute says: CPC s.117 is silent on whether a part of a day in custody counts as a day. 2. Authority relied on: Interpretation Acts 1948 and 1967 (Act 388), s.54(1)(a). The text must be quoted [REVIEWER TO CONFIRM]: if s.54(1)(a) is the usual rule that a period of days reckoned from an event is exclusive of the day on which the event happens, then the day of the remand order would NOT count as the first day, which points the other way from the assumption below. The reviewer must reconcile the two or re-label the assumption as a policy choice. 3. Calculator assumption (policy choice pending that check): any partial calendar day spent in custody counts as one full day against the statutory caps, so the model errs on the side of the detainee.",
}

# ---------------------------------------------------------------- Sources & currency (column E by instrument / first-column key)
SRC_E = {
    "Federal Constitution": f"{CHECK_DATE} | Result: No amendment in force after the reprint date (30 Nov 2025; latest amendment Act A1663). | Effect: None of the cited provisions (FC Arts 5, 8, 9, 13) changed.",
    "Criminal Procedure Code": f"{CHECK_DATE} | Result: Amending Acts in force after the reprint date (1 Oct 2022): Act 846 (in force 4 Jul 2023, per Penal Code reprint), Act A1682 (2023), Act A1722 (2024). | Effect: s.15(3) amended by Act 846 s.61 (adds the 30-40 year term); none of the other cited sections (ss.16-28A, 56, 64-65, 111-117, Fourth Schedule) changed. ss.38-47 are cited but their text is not in the pack and was not checked [REVIEWER TO CONFIRM once the text is added]. Commencement of A1682 and A1722: see the amending-instruments block below.",
    "Police Act 1967": f"{CHECK_DATE} | Result: Reprint as at 10 May 2024 already incorporates Act A1705 (2024). No later amending Act identified in the sources supplied. A 2025 amendment was referred to in the review without an Act number [REVIEWER TO CONFIRM: Act number and commencement, or delete the reference]. | Effect: None of the cited sections (ss.14, 20, 24, 26) changed.",
    "Road Transport Act 1987": f"{CHECK_DATE} | Result: Amending Acts after the reprint date (1 Apr 2019): Act A1623 (in force Oct 2020 per reviewer; LOM reference [REVIEWER TO CONFIRM]); Act A1794 (2026), not yet in force. | Effect: s.112(1)(a) offence list changed by A1794 (not in force); none of the other cited sections (ss.55, 58, 78, 123) changed. The reviewer's earlier reference to a 15 Oct 2023 reprint is withdrawn unless an LOM reference is supplied.",
    "Dangerous Drugs Act 1952": f"{CHECK_DATE} | Result: No amendment in force after the reprint date (26 Nov 2025). | Effect: None of the cited sections (ss.27, 37B) changed.",
    "Security Offences (Special Measures) Act 2012": f"{CHECK_DATE} | Result: Amending Act after the reprint date (1 Aug 2015): Security Offences (Special Measures) (Amendment) Act 2024 (Act A1736), Gazette 1 Nov 2024; commencement by Minister's notification {GAZ}. | Effect: A1736 deletes s.19 only (it does not amend the First Schedule); cited ss.4 and 5 unchanged. s.4(5) remains subject to five-yearly parliamentary renewal under s.4(11): date of last resolution [REVIEWER TO CONFIRM].",
    "Computer Crimes Act 1997": f"{CHECK_DATE} | Result: No amendment in force after the reprint date (1 Dec 2011); the reprint records no amending law. | Effect: None of the cited sections (ss.5, 10, 11) changed.",
    "Evidence Act 1950": f"{CHECK_DATE} | Result: Amending Act after the reprint date (1 Nov 2017): Evidence (Amendment) Act 2024 (Act A1732); commencement {GAZ}. | Effect: A1732 amends provisions on electronic evidence (per reviewer); cited ss.24, 25, 26 unchanged.",
    "Penal Code": f"{CHECK_DATE} | Result: Amending Acts after the reprint date (4 Jul 2023): Act A1691 (2023), Act A1721 (2024), Act A1750 (2025); commencement dates: see the amending-instruments block below. | Effect: Amendments concern new offences (s.507A stalking; ss.424A-424D mule accounts; cyberbullying provisions, per reviewer); cited ss.330, 339-342, 348 unchanged.",
    "Malaysian Anti-Corruption Commission Act 2009": f"{CHECK_DATE} | Result: No amendment in force after the reprint date (1 Sep 2019) identified. The reviewer's earlier reference to a 1 Jan 2022 reprint is withdrawn unless an LOM reference is supplied [REVIEWER TO CONFIRM]. | Effect: Cited s.30 unchanged.",
    "Communications and Multimedia Act 1998": f"{CHECK_DATE} | Result: Amending Act after the reprint date (1 Jan 2006): Communications and Multimedia (Amendment) Act 2025 (Act A1743; Royal Assent 27 Jan 2025; commences by Gazette notification, possibly in parts). The earlier reference to an 'Oct 2026' amendment is withdrawn: the October 2026 Act supplied to this project (Act A1799) amends the Malaysian Communications and Multimedia Commission Act 1998 (Act 589), not this Act. | Effect: A1743 amends s.233 and substitutes s.250 (per currency note). Whether A1743 amends cited s.249, and the commencement date for s.249 {GAZ}: [REVIEWER TO CONFIRM]. Until then prv.cma_s249 stays Amend.",
    "prv.cpc_s15": f"{CHECK_DATE} | Result: Act 846 in force 4 July 2023 (per the Penal Code reprint supplied; 16 Jun 2023 was the Gazette publication date). | Effect: s.15(3) amended by Act 846 s.61 to add 'imprisonment for a term of not less than thirty years but not exceeding forty years'. Consolidated text verified against Act 846 s.61.",
    "prv.cma_s249": f"{CHECK_DATE} | Result: Act A1743, Royal Assent 27 Jan 2025; commencement for s.249 {GAZ}. Conflicting statements in successive reviews (commenced 11 Feb 2025 under P.U.(B) 61/2025 / not yet commenced) must be resolved. | Effect: Whether s.249 is amended by A1743 [REVIEWER TO CONFIRM]. prv.cma_s249 and ast.phone_content_uncertain remain unconfirmed.",
    "prv.rta_s112": f"{CHECK_DATE} | Result: Act A1794 (2026) enacted; not yet in force as at check date (commencement by Gazette notification {GAZ}). | Effect: s.112(1)(a) offence list changes when A1794 commences; current text unaffected. Watch-list item.",
    "Abolition of Mandatory Death Penalty Act 2023 (Act 846)": f"{CHECK_DATE} | Result: In force 4 July 2023 (Penal Code reprint records Act 846 as its latest amendment, in operation 4 July 2023; Gazette publication 16 June 2023). | Effect: Amends CPC s.15(3); amends Penal Code and DDA sentencing provisions (DDA s.39B(2): death or life imprisonment, whipping not less than twelve strokes).",
    "Criminal Procedure Code (Amendment) Act 2023 (Act A1682)": f"{CHECK_DATE} | Result: Commencement 31 May 2023 per reviewer {GAZ}. | Effect: Inserts procedural provisions for stalking (per reviewer); none of the cited CPC sections changed.",
    "Criminal Procedure Code (Amendment) Act 2024 (Act A1722)": f"{CHECK_DATE} | Result: Commencement: two dates given in successive reviews (30 Oct 2024 under P.U.(B) 434/2024; '2024') {GAZ}. | Effect: Inserts provisions on cyber/financial crime (per reviewer); none of the cited CPC sections changed.",
    "Penal Code (Amendment) Act 2023 (Act A1691)": f"{CHECK_DATE} | Result: Commencement: two dates given in successive reviews (10 Sep 2025 under P.U.(B) 328/2025; 31 Jul 2023) {GAZ}. | Effect: Inserts s.507A (stalking); cited ss.330, 339-342, 348 unchanged.",
    "Penal Code (Amendment) Act 2024 (Act A1721)": f"{CHECK_DATE} | Result: Commencement: two dates given in successive reviews (30 Oct 2024 under P.U.(B) 433/2024; 30 Sep 2024) {GAZ}. | Effect: Inserts ss.424A-424D (mule accounts); cited sections unchanged.",
    "Penal Code (Amendment) Act 2025 (Act A1750)": f"{CHECK_DATE} | Result: Commencement: two dates given in successive reviews (11 Jul 2025; 31 Aug 2025) {GAZ}. | Effect: Cyberbullying/harassment provisions (per reviewer); cited sections unchanged.",
    "Security Offences (Special Measures) (Amendment) Act 2024 (Act A1736)": f"{CHECK_DATE} | Result: Gazette publication 1 Nov 2024 (per the Act text supplied); commencement by Minister's notification: two dates given in successive reviews (3 Mar 2025; 31 Dec 2024) {GAZ}. | Effect: Deletes s.19 only; cited ss.4, 5 unchanged.",
    "Evidence (Amendment) Act 2024 (Act A1732)": f"{CHECK_DATE} | Result: Commencement: two dates given in successive reviews (3 Mar 2025; 31 Dec 2024), identical to the A1736 entries in each review {GAZ}. | Effect: Electronic evidence provisions (per reviewer); cited ss.24-26 unchanged.",
    "Communications and Multimedia (Amendment) Act 2025 (Act A1743)": f"{CHECK_DATE} | Result: Royal Assent 27 Jan 2025; commences by Gazette notification and may commence in parts. Two conflicting statements in successive reviews (commenced 11 Feb 2025 under P.U.(B) 61/2025; pending). Commencement for s.249 specifically {GAZ}. | Effect: Amends s.233, substitutes s.250 (per currency note); effect on cited s.249 [REVIEWER TO CONFIRM].",
    "Road Transport (Amendment) Act 2026 (Act A1794)": f"{CHECK_DATE} | Result: Enacted 2026 (Gazette 15 Sep 2026 per reviewer; LOM reference [REVIEWER TO CONFIRM]); not yet in force. | Effect: Amends s.112(1)(a) offence list; no current effect.",
}
SRC_SKIP = {None, "Cited provisions named by a later amending Act", "Provision", "Amending instruments supplied"}


def wrap(cell):
    cell.alignment = Alignment(wrap_text=True, vertical="top")


def main(orig, upd, out):
    wb = load_workbook(orig)
    uw = load_workbook(upd, data_only=True)

    # ---- Provisions: carry reviewer's updated verdict/notes, then apply corrections
    ws = wb["Provisions"]; hdr = [c.value for c in ws[1]]
    ci_id, ci_v, ci_n = hdr.index("ID") + 1, hdr.index("Verdict") + 1, hdr.index("Reviewer notes") + 1
    us = uw["provisions"]; uh = [c.value for c in us[1]]
    upd_rows = {r[uh.index("ID")]: r for r in us.iter_rows(min_row=2, values_only=True) if r[uh.index("ID")]}
    changed = []
    for r in range(2, ws.max_row + 1):
        pid = ws.cell(row=r, column=ci_id).value
        if not pid:
            continue
        u = upd_rows[pid]
        verdict, note = u[uh.index("Verdict")], u[uh.index("Reviewer_notes")]
        if pid in PROV_NOTES:
            note = PROV_NOTES[pid]; changed.append(("Provisions", pid))
        ws.cell(row=r, column=ci_v, value=verdict); ws.cell(row=r, column=ci_n, value=note)
        wrap(ws.cell(row=r, column=ci_n))

    # ---- Calculator: carry reviewer's updated answers, then apply corrections
    ws = wb["Calculator"]; us = uw["calculator"]
    upd_calc = {}
    for r in us.iter_rows(min_row=2, values_only=True):
        if r[0]:
            upd_calc[(r[0], r[1] if r[0] == "OPEN QUESTION" else None)] = r[3]
    for r in range(2, ws.max_row + 1):
        item, value = ws.cell(row=r, column=1).value, ws.cell(row=r, column=2).value
        if not item:
            continue
        key = (item, value if item == "OPEN QUESTION" else None)
        note = CALC_NOTES.get(key, upd_calc.get(key))
        if key in CALC_NOTES:
            changed.append(("Calculator", item if key[1] is None else key[1][:40]))
        ws.cell(row=r, column=4, value=note); wrap(ws.cell(row=r, column=4))

    # ---- Sources & currency: rewrite column E and F
    ws = wb["Sources & currency"]
    for r in range(2, ws.max_row + 1):
        key = ws.cell(row=r, column=1).value
        if key in SRC_SKIP:
            continue
        if key not in SRC_E:
            raise KeyError(key)
        ws.cell(row=r, column=5, value=SRC_E[key]); wrap(ws.cell(row=r, column=5))
        ws.cell(row=r, column=6, value=CHECKED_BY); wrap(ws.cell(row=r, column=6))
        changed.append(("Sources & currency", key))
    ws.column_dimensions["E"].width = 90

    # ---- Change log sheet
    log = wb.create_sheet("QA change log")
    log.append(["Tab", "Row", "What changed"])
    for c in log[1]:
        c.font = Font(bold=True, color="FFFFFF"); c.fill = PatternFill("solid", fgColor="1F3864")
    for tab, key in changed:
        what = {
            "Provisions": "Reviewer's updated three-part note kept; page reference, currency statement or OCR list corrected as described in the note.",
            "Calculator": "Reviewer's updated answer kept; caveat or authority step corrected and unverifiable items marked [REVIEWER TO CONFIRM].",
            "Sources & currency": "Column E rewritten in date | Result | Effect form; conflicting dates from the two reviews recorded; Gazette references marked [REVIEWER TO CONFIRM]; column F restored to a named checker.",
        }[tab]
        log.append([tab, key, what])
    log.append([])
    log.append(["Not changed", "Assertions, Rules, Routes, Entities, Red Book, Sign-off", "Left exactly as submitted. Two Assertions rows (ast.phone_content_uncertain, ast.habeas_corpus_sosma) and one Routes row (Arrest under a warrant) still need the corrections in QA_report_2026-10-13.md."])
    log.append(["Placeholders", "[REVIEWER TO CONFIRM]", "Facts that cannot be verified against the sources supplied to this project (Gazette commencement notifications, later reprints, parliamentary renewal of SOSMA s.4(5), Interpretation Acts s.54 text). The reviewer must fill these from the LOM portal before sign-off."])
    for col, w in zip("ABC", (20, 60, 110)):
        log.column_dimensions[col].width = w
    for row in log.iter_rows(min_row=2):
        for c in row:
            wrap(c)

    wb.save(out)
    print("rows changed:", len(changed))


if __name__ == "__main__":
    main(*sys.argv[1:4])
