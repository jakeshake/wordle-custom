#!/usr/bin/env python3
"""Regenerate the Spelling Bee and Letter Boxed word lists.

Outputs (committed, served as-is by the app):
  public/words-bee.js    BEE_WORDS    - common words; daily hives are picked
                                        from these (and they're answers)
                         BEE_EXTRA    - more accepted answers: inflections
                                        of common words ("doodled",
                                        "needled") and slightly rarer words
  public/words-boxed.js  BOXED_VALID  - every word Letter Boxed accepts
                         BOXED_COMMON - common words the daily puzzle's
                                        built-in solution is drawn from

Sources:
  ENABLE word list (public domain Scrabble-style dictionary)
  wordfreq (pip install wordfreq) for word commonness
  lemminflect (pip install lemminflect) for inflected forms of common words
  LDNOOBW English list to keep offensive words out of answer lists

Usage:  pip install wordfreq lemminflect && python3 tools/build_words.py
"""

import os
import re
import urllib.request

import wordfreq
from lemminflect import getAllInflections

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, "tools", ".cache")

ENABLE_URL = "https://raw.githubusercontent.com/dolph/dictionary/master/enable1.txt"
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

    candidate_set = set(bee_candidates)
    extra = set()
    for base in enable:
        if base in blocked or zipf(base) < BEE_INFLECTION_BASE_MIN_ZIPF:
            continue
        for tag, forms in getAllInflections(base).items():
            if tag in BEE_INFLECTION_TAGS:
                extra.update(
                    f for f in forms
                    if f in candidate_set and f not in bee_set and zipf(f) >= BEE_INFLECTION_MIN_ZIPF
                )
    bee_extra = sorted(extra)

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
    boxed_avoid = sorted(w for w in boxed_common if w in EXTRA_BLOCK)

    header = "// Generated by tools/build_words.py - do not edit by hand.\n"
    with open(os.path.join(ROOT, "public", "words-bee.js"), "w") as f:
        f.write(header)
        f.write('const BEE_WORDS = "%s".split(" ");\n' % " ".join(bee))
        f.write('const BEE_EXTRA = "%s".split(" ");\n' % " ".join(bee_extra))
    with open(os.path.join(ROOT, "public", "words-boxed.js"), "w") as f:
        f.write(header)
        f.write('const BOXED_VALID = "%s".split(" ");\n' % " ".join(boxed_valid))
        f.write('const BOXED_COMMON = "%s".split(" ");\n' % " ".join(boxed_common))
        f.write('const BOXED_AVOID = "%s".split(" ");\n' % " ".join(boxed_avoid))

    print(f"bee answers: {len(bee)} common + {len(bee_extra)} extra")
    print(f"boxed valid: {len(boxed_valid)}, boxed common: {len(boxed_common)}")


if __name__ == "__main__":
    main()
