#!/usr/bin/env python3
"""Regenerate the Spelling Bee and Letter Boxed word lists.

Outputs (committed, served as-is by the app):
  public/words-bee.js    BEE_WORDS    - common words daily hives are picked
                                        from (generator input only; kept
                                        stable so puzzles never reshuffle)
                         BEE_ANSWERS  - every accepted Spelling Bee answer,
                                        modeled on the NYT's own list (below)
  public/words-boxed.js  BOXED_VALID  - every word Letter Boxed accepts
                         BOXED_COMMON - common words the daily puzzle's
                                        built-in solution is drawn from

Spelling Bee answers follow the NYT. Archives of past NYT puzzles record
which words the NYT accepted, and - since every word that fit a puzzle's
letters but isn't in its answer list was turned down - which it rejected.
Each word takes its most recent NYT verdict. Words the NYT has never had a
chance to judge fall back to our own list (common words, well-known
dictionary words, inflections). Petitions override everything.

Sources:
  NYT Spelling Bee answer archives on GitHub (cloned automatically):
    tedmiston/spelling-bee-answers, philshem/scrape_bee,
    bwillenbring/nytimes-bee
  ENABLE word list (public domain Scrabble-style dictionary)
  wordfreq (pip install wordfreq) for word commonness
  lemminflect (pip install lemminflect) for inflected forms of common words
  SCOWL (spell-checker word lists, downloaded automatically) for which
    words are well known, independent of how often they appear in text
  LDNOOBW English list to keep offensive words out of answer lists

Usage:  pip install wordfreq lemminflect && python3 tools/build_words.py
"""

import glob
import json
import os
import re
import subprocess
import tarfile
import unicodedata
import urllib.request

import wordfreq
from lemminflect import getAllInflections

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, "tools", ".cache")

ENABLE_URL = "https://raw.githubusercontent.com/dolph/dictionary/master/enable1.txt"
SCOWL_URL = "https://downloads.sourceforge.net/project/wordlist/SCOWL/2020.12.07/scowl-2020.12.07.tar.gz"
PETITIONS = os.path.join(ROOT, "tools", "bee-petitions.txt")
NYT_ARCHIVES = [
    "tedmiston/spelling-bee-answers",
    "philshem/scrape_bee",
    "bwillenbring/nytimes-bee",
]
BLOCK_URL = (
    "https://raw.githubusercontent.com/LDNOOBW/"
    "List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words/master/en"
)

# Words the blocklist catches that are fine in a word game.
ALLOW = {
    "escort", "domination", "fingering", "snatch", "scat", "bastinado",
    "strappado", "figging", "shrimping", "snowballing", "scissoring",
    "throating", "undressing", "intercourse", "eunuch", "fecal", "rectum",
    "grope", "butt", "suck", "sucks", "hardcore", "playboy", "swinger",
}

# Slurs and other words the LDNOOBW list misses. Kept out of every answer
# and solution list (Letter Boxed still accepts ENABLE words as typed).
EXTRA_BLOCK = {
    "chink", "chinks", "chinky", "honky", "honkie", "honkies", "dyke", "dykes",
    "retard", "retards", "retarded", "gimp", "gimps", "gimpy", "gook", "gooks",
    "coolie", "coolies", "kaffir", "kaffirs", "jewed", "jewing", "gyp", "gyps",
    "gyped", "gypped", "gyping", "gypping", "wop", "wops", "dago", "dagos",
    "darkey", "darky", "darkie", "squaw", "squaws", "paki", "kike", "kikes",
    "spaz", "spastic", "tranny", "injun", "beaner", "redneck", "rednecks",
    "negro", "negroes", "polack", "hebe", "yid", "yids", "jap", "japs",
    "homo", "homos", "lesbo", "tard", "midget", "midgets", "halfbreed",
    "raghead", "towelhead", "wetback", "coon", "coons", "fag", "fags", "faggot",
}

# Words blocked after puzzles were already being played. They stay in
# BEE_WORDS (the list hives are picked from) so no daily hive changes, but
# never appear in BEE_ANSWERS (and Letter Boxed skips them via BOXED_AVOID).
# Add new blocks here rather than to EXTRA_BLOCK.
LATE_BLOCK = {
    "negroid", "mulatto", "mulattoes", "nazi", "nazis", "heil", "heiled",
    # Crude words NYT-style puzzles leave out.
    "crap", "crapped", "crapping", "crappy", "crappier", "crappiest", "turd",
    "turds", "fart", "farted", "farting", "farts", "poop", "pooped", "pooping",
    "peed", "peeing", "pecker", "peckers", "prick", "pricks", "bimbo", "bimbos",
    "floozy", "floozie", "trollop", "penile", "pubic", "ejaculate", "ejaculated",
    "ejaculating", "bugger", "buggered", "buggering", "buggery", "goddam",
    "goddamn", "goddamned", "damn", "damned", "damning",
}

# Spelling Bee: how common a word must be to count as an answer. NYT only
# accepts reasonably common words; 2.6 on wordfreq's Zipf scale keeps
# everyday vocabulary while dropping Scrabble-only obscurities.
BEE_MIN_ZIPF = 2.6
# Extra accepted answers (never used to pick a hive): inflected forms of
# common words - past tense, -ing, comparatives, irregulars ("beheld").
# Inflections are rarer in text than their base word, so "needle" (3.98)
# clears the cutoff while "needled" (1.82) doesn't. (Lowering the cutoff
# itself instead mostly adds names and oddities like "dene" and "dele".)
BEE_INFLECTION_BASE_MIN_ZIPF = 2.4
BEE_INFLECTION_TAGS = ("VBD", "VBN", "VBG", "JJR", "JJS")
# The inflected form itself must still turn up in real text now and then,
# which drops rule-generated oddities like "hoboed" or "ghettoing".
BEE_INFLECTION_MIN_ZIPF = 1.0
# Word frequency is a poor signal for "would a solver know this word":
# real words like epee (1.8), appall (1.5) score below junk like dene
# (2.5). SCOWL ranks words by how widely they're known instead (10 = most
# common ... 95 = most obscure); 55 is a standard-size spell checker and
# covers words like fidget, blithe, myrrh, ennui without the oddities.
BEE_SCOWL_MAX_LEVEL = 55
# Letter Boxed: the generator builds each daily puzzle around a two-word
# solution from this (more common) pool so the intended answer is fair.
BOXED_COMMON_MIN_ZIPF = 3.3


def fetch(url, name):
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, name)
    if not os.path.exists(path):
        urllib.request.urlretrieve(url, path)
    with open(path) as f:
        return [line.strip().lower() for line in f if line.strip()]


def scowl_levels():
    """word -> lowest SCOWL size level it appears in (US + common English)."""
    os.makedirs(CACHE, exist_ok=True)
    tar_path = os.path.join(CACHE, "scowl.tar.gz")
    if not os.path.exists(tar_path):
        urllib.request.urlretrieve(SCOWL_URL, tar_path)
    out_dir = os.path.join(CACHE, "scowl")
    if not os.path.isdir(out_dir):
        with tarfile.open(tar_path) as t:
            t.extractall(out_dir)
    levels = {}
    for path in glob.glob(os.path.join(out_dir, "*", "final", "*")):
        m = re.match(r"(english|american)-words\.(\d+)$", os.path.basename(path))
        if not m:
            continue
        level = int(m.group(2))
        with open(path, encoding="latin-1") as fh:
            for line in fh:
                # SCOWL spells some loanwords with accents (épée -> epee).
                w = unicodedata.normalize("NFKD", line.strip()).encode("ascii", "ignore").decode()
                if re.fullmatch(r"[a-z]+", w):
                    levels[w] = min(levels.get(w, 99), level)
    return levels


def clone_archive(repo):
    path = os.path.join(CACHE, "nyt", repo.replace("/", "__"))
    if not os.path.isdir(path):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        subprocess.run(
            ["git", "clone", "-q", "--depth", "1", f"https://github.com/{repo}", path],
            check=True,
            env={**os.environ, "GIT_LFS_SKIP_SMUDGE": "1"},
        )
    return path


def nyt_history():
    """(puzzles, extra_accepted): puzzles maps date -> (letter mask, center
    bit, set of answers); extra_accepted is NYT answers known only as a bare
    word list (no puzzle to say what was rejected alongside them)."""
    puzzles = {}

    def add(p):
        if not isinstance(p, dict) or "answers" not in p or "printDate" not in p:
            return
        answers = {a.lower() for a in p["answers"] if re.fullmatch(r"[A-Za-z]+", a)}
        letters = "".join(p["validLetters"]).lower()
        puzzles[p["printDate"]] = (mask(letters), mask(p["centerLetter"].lower()), answers)

    ted = clone_archive(NYT_ARCHIVES[0])
    for path in glob.glob(os.path.join(ted, "days", "*.json")):
        with open(path) as fh:
            add(json.load(fh))
    phil = clone_archive(NYT_ARCHIVES[1])
    for path in glob.glob(os.path.join(phil, "data", "*.json")):
        with open(path) as fh:
            day = json.load(fh)
        add(day.get("today"))
        add(day.get("yesterday"))
    bw = clone_archive(NYT_ARCHIVES[2])
    with open(os.path.join(bw, "local_dictionary", "words.json")) as fh:
        # Not always valid JSON, so pull the words out directly.
        extra = {w.lower() for w in re.findall(r'"word":\s*"([A-Za-z]+)"', fh.read())}
    return puzzles, extra


def mask(word):
    m = 0
    for ch in word:
        m |= 1 << (ord(ch) - 97)
    return m


def nyt_verdicts(puzzles, pool):
    """word -> True/False: was it in the answers the most recent time it fit
    a puzzle (center letter + only puzzle letters, 4+ long)?"""
    masks = [(w, mask(w)) for w in pool]
    verdict = {}
    for date in sorted(puzzles):
        letters, center, answers = puzzles[date]
        for w, m in masks:
            if m & center and not m & ~letters and len(w) >= 4:
                verdict[w] = w in answers
        for a in answers:
            verdict[a] = True
    return verdict


def read_petitions():
    """tools/bee-petitions.txt: one word per line to add, or -word to remove."""
    add, remove = set(), set()
    if os.path.exists(PETITIONS):
        with open(PETITIONS) as fh:
            for line in fh:
                w = line.split("#", 1)[0].strip().lower()
                if not w:
                    continue
                (remove if w.startswith("-") else add).add(w.lstrip("-"))
    return add, remove


def main():
    enable = [w for w in fetch(ENABLE_URL, "enable1.txt") if re.fullmatch(r"[a-z]+", w)]
    base_blocked = set(fetch(BLOCK_URL, "blocklist.txt")) - ALLOW
    blocked = base_blocked | EXTRA_BLOCK

    def zipf(w):
        return wordfreq.zipf_frequency(w, "en")

    # Spelling Bee never uses S (same as NYT, which keeps plurals out), so
    # any word containing S can never be an answer.
    bee_candidates = [
        w for w in enable
        if len(w) >= 4 and "s" not in w and len(set(w)) <= 7 and w not in blocked
    ]
    bee = sorted(w for w in bee_candidates if zipf(w) >= BEE_MIN_ZIPF)
    bee_set = set(bee)
    blocked |= LATE_BLOCK
    bee_candidates = [w for w in bee_candidates if w not in LATE_BLOCK]

    # Our own list: the fallback for words the NYT has never judged.
    candidate_set = set(bee_candidates)
    ours = set(bee)
    for base in enable:
        if base in blocked or zipf(base) < BEE_INFLECTION_BASE_MIN_ZIPF:
            continue
        for tag, forms in getAllInflections(base).items():
            if tag in BEE_INFLECTION_TAGS:
                ours.update(
                    f for f in forms
                    if f in candidate_set and zipf(f) >= BEE_INFLECTION_MIN_ZIPF
                )
    levels = scowl_levels()
    ours.update(w for w in bee_candidates if levels.get(w, 99) <= BEE_SCOWL_MAX_LEVEL)

    # NYT history: most recent verdict wins.
    puzzles, nyt_extra = nyt_history()
    nyt_answers = {a for _, _, ans in puzzles.values() for a in ans}
    pool = candidate_set | ours | nyt_answers | nyt_extra
    verdict = nyt_verdicts(puzzles, pool)
    nyt_ok = {w for w, ok in verdict.items() if ok}
    untested = {w for w in (ours | nyt_extra) if w not in verdict}

    def playable(w):
        return len(w) >= 4 and "s" not in w and len(set(w)) <= 7 and re.fullmatch(r"[a-z]+", w)

    answers = {w for w in nyt_ok | untested if playable(w) and w not in blocked}
    petition_add, petition_remove = read_petitions()
    for w in sorted(petition_add):
        if not playable(w) or w in blocked:
            print(f"petition skipped (has S, too short, too many letters, or blocked): {w}")
    answers |= {w for w in petition_add if playable(w) and w not in blocked}
    answers -= petition_remove
    bee_answers = sorted(answers)
    print(
        f"nyt history: {len(puzzles)} puzzles ({min(puzzles)} .. {max(puzzles)}), "
        f"{len(nyt_ok)} accepted, {sum(1 for v in verdict.values() if not v)} rejected"
    )

    # Letter Boxed: consecutive letters must sit on different sides, so a
    # doubled letter ("ll", "ee") can never be played - drop those words.
    no_double = [w for w in enable if len(w) >= 3 and not re.search(r"(.)\1", w)]
    boxed_valid = sorted(w for w in no_double if len(set(w)) <= 12)
    # BOXED_COMMON is the generator's pool, so its contents (and order) decide
    # every daily box - EXTRA_BLOCK words stay in it and are listed in
    # BOXED_AVOID instead, which the generator skips. That way adding a word
    # to EXTRA_BLOCK never reshuffles puzzles people are already playing.
    boxed_common = sorted(
        w for w in boxed_valid
        if w not in base_blocked and 3 <= len(w) <= 10 and zipf(w) >= BOXED_COMMON_MIN_ZIPF
    )
    boxed_avoid = sorted(w for w in boxed_common if w in EXTRA_BLOCK or w in LATE_BLOCK)

    header = "// Generated by tools/build_words.py - do not edit by hand.\n"
    with open(os.path.join(ROOT, "public", "words-bee.js"), "w") as f:
        f.write(header)
        f.write('const BEE_WORDS = "%s".split(" ");\n' % " ".join(bee))
        f.write('const BEE_ANSWERS = "%s".split(" ");\n' % " ".join(bee_answers))
    with open(os.path.join(ROOT, "public", "words-boxed.js"), "w") as f:
        f.write(header)
        f.write('const BOXED_VALID = "%s".split(" ");\n' % " ".join(boxed_valid))
        f.write('const BOXED_COMMON = "%s".split(" ");\n' % " ".join(boxed_common))
        f.write('const BOXED_AVOID = "%s".split(" ");\n' % " ".join(boxed_avoid))

    print(f"bee: {len(bee)} hive-picking words, {len(bee_answers)} accepted answers")
    print(f"boxed valid: {len(boxed_valid)}, boxed common: {len(boxed_common)}")


if __name__ == "__main__":
    main()
