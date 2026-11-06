# Content provenance and scoring

Verified on 2026-09-12.

## Built-in content

The fully answerable paper `practice-001` is an original CET-6-format practice paper written for this application. It is not an actual past examination. All passages, listening scripts, prompts, choices, reference answers and explanations are original. The question counts and weights follow the published CET-6 structure; this is a product demonstration and its passage lengths and difficulty have not been calibrated against official examinations.

Past-examination entries are a source catalogue. They identify real sessions and link to independently published materials. They do not claim that an official examination paper is installed locally. A user can import a structured question file that they have permission to use; imported data remains local to this installation.

## Exam structure

Primary source: [China Education Examinations Authority, CET written examination](https://cet.neea.edu.cn/html1/folder/16113/1586-1.htm).

| Section | Questions | Weight | Answering time |
| --- | --- | --- | --- |
| Writing | 1 | 15% | 30 minutes |
| Listening: long conversations | 8 | 8% | Part of 30 minutes |
| Listening: passages | 7 | 7% | Part of 30 minutes |
| Listening: talks / reports / lectures | 10 | 20% | Part of 30 minutes |
| Reading: word selection | 10 | 5% | Part of 40 minutes |
| Reading: paragraph matching | 10 | 10% | Part of 40 minutes |
| Reading: close reading | 10 | 20% | Part of 40 minutes |
| Translation | 1 | 15% | 30 minutes |
| Total | 57 | 100% | 130 minutes |

The scheduled venue window can be longer because it includes administrative procedures. The app's countdown covers the published 130 minutes of answering time.

## Scores

Primary source: [China Education Examinations Authority, score interpretation](https://cet.neea.cn/html1/folder/19081/5124-1.htm).

Official CET results use norm-referenced conversion after equating; 710 is the reported scale. A local weighted sum cannot reproduce this conversion without its reference data. The application therefore reports a practice estimate, never an official CET reported score. Objective questions can be marked against stored answer keys. Writing and translation require rubric-based human assessment or an explicitly configured assessment service; reference texts alone are not sufficient for reliable automatic subjective grading. Unmarked writing and translation must remain visibly pending instead of being silently scored as zero or judged from word count alone.

## Historical session verification

| Session | Primary date source | Material source |
| --- | --- | --- |
| December 2025 | [CEEA notice: 13 December 2025](https://cet.neea.edu.cn/xhtml1/report/2509/26-1.htm) | [New Oriental collection](https://www.xdf.cn/1001/202512/15052565.html) |
| June 2025 | [CEEA notice: 14 June 2025](https://cet.neea.edu.cn/html1/report/2503/19-1.htm) | [New Oriental, second set](https://m.koolearn.com/cet6/20250609/901414.html) |
| December 2024 | [CEEA notice: 14 December 2024](https://cet.neea.edu.cn/html1/report/2409/8-1.htm) | [New Oriental, second set](https://m.koolearn.com/cet6/20250415/898835.html) |
| December 2023 | [CEEA notice: 16 December 2023](https://cet.neea.edu.cn/html1/report/2309/7-1.htm) | [New Oriental, second set](https://m.koolearn.com/cet6/20240229/884399.html) |

These external pages may change. Publisher reconstructions and recollections are not official answer-key publications. A date source verifies the session, not the accuracy of a publisher's answers.

## Dataset research

- [wamich/english-exem-md](https://github.com/wamich/english-exem-md) publishes Markdown conversions and a GPL-2.0 repository license. Its README identifies PDF / image conversions and New Oriental source materials. The repository license alone does not establish permission to redistribute third-party exam passages, so no paper text from that repository is bundled here.
- [HCLEMINI/CET6-Full-Process-Learning](https://github.com/HCLEMINI/CET6-Full-Process-Learning) documents a local JSON workflow and explicitly excludes past-paper PDF / MP3 content from its repository. Its practice-content interface helped verify that a separate import workflow is viable; no code or data was copied.
- [codes-books/CET-6](https://github.com/codes-books/CET-6) contains historical listening material but did not establish a reusable content license or a complete modern examination dataset.

## Answer validation

Original objective answers are grounded in the accompanying passage or listening script. Each explanation identifies the relevant wording or reasoning. Practice weights total 100, comprising 70 objective points and 30 subjective points. The seed data has 55 objective questions plus two written responses.

Listening uses the original scripts supplied with the practice paper. Browser speech synthesis, when offered, is synthetic practice audio and must not be described as the recording of an actual examination.

### Substantive review on 2026-09-12

All 55 objective items were read against their complete supporting scripts or passages, including each distractor. No remaining answer-key contradiction was found. This was a content review, not a statistical difficulty calibration or an independent teaching certification.

- Listening 1-8: keys B/D/A/C/C/B/A/D follow explicit statements about access, electrical-device appointments, volunteer instruction, independent attempts, sample bias, actual journeys and practical barriers. Item 4 was tightened from successful independent repair to returning to attempt a repair, matching the speaker's actual criterion.
- Listening 9-15: keys B/C/A/D/B/A/C are supported by the scheduling trial, documented archival uncertainty and cafeteria serving experiment. The library trial's final sentences now distinguish a planned comparison from a comparison already completed.
- Listening 16-25: keys D/B/A/C/B/D/A/C/A/D follow the contrasts between recognition and recall, supported instruction, practical access, early user involvement and reconstructable research decisions.
- Cloze 26-35: the completed sequence is accessible / flexible / isolation / sequence / retrieve / reinforce / evidence / measurable / underestimate / participate. Item 30 was rewritten around retrieving ideas from memory; the previous retain/reinforce pair allowed an avoidable overlap in plausible collocations. Each selected word is used once, the parts of speech fit, and the five unused words do not supply an equally supported complete solution.
- Matching 36-45: E/H/B/G/J/D/C/I/F/A. Each statement has one paragraph with its specific claim. In particular, E concerns privacy while H concerns evaluation; B concerns meeting schedules while J concerns consulting non-users. These potentially related topics do not provide competing answers.
- Close reading 46-50: B/D/A/C/B, supported respectively by visibility incentives, continuity, newcomer support, outcomes beyond message counts, and organisational expectations.
- Close reading 51-55: C/A/D/B/C, supported respectively by learning opportunities, visible diagnostic reasoning, safety and trust, manufacturer decisions, and judgement gained despite failure.
- Writing: the 172-word reference addresses community participation, offers a concrete repair-workshop example, and explains reflection. It fits the 150-200 word request. Translation: the reference covers each of the five source sentences without a missing proposition; reasonable alternative translations remain valid.

All four material-source URLs and all four date-source URLs returned HTTP 200 in direct GET checks. Page titles match December 2025 (collection), June 2025 (second set), December 2024 (second set), and December 2023 (second set). The last entry was changed from a general historical index to a direct second-set page. The June 2025 date source was replaced with the national examination authority's notice after direct requests to the Shanghai notice failed. The June 2025 material page has an inconsistent subheading calling its listening material May 2025, despite a June title and June paper links; the app links to the publisher page and does not certify or embed that audio. A newer June 2025 link in the publisher's index still said it was being updated, so it was not used as a replacement.
