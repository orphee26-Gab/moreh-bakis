# Schéma des données (brouillon à valider)

Toutes les données sont des **brouillons** (`"status": "draft"`) tant que Gabriel ne les a pas validées.
Règle d'or : chaque élément vient d'un document officiel réellement lu ; sinon il va dans `unverified`.

## Matières du lycée — `data/curriculum/<id>.json`

Identifiants : `math`, `geometry`, `english`, `physics`, `history`, `tanakh`, `hebrew`.

```json
{
  "id": "math",
  "name": { "he": "מתמטיקה", "fr": "Mathématiques" },
  "schoolYear": "תשפ\"ז",
  "status": "draft",
  "retrievedAt": "2026-11-10",
  "officialPages": ["https://pop.education.gov.il/..."],
  "levels": [
    {
      "units": 5,
      "label": { "he": "5 יחידות לימוד", "fr": "5 yéhidot" },
      "grades": [
        {
          "grade": "10",
          "gradeLabel": "י'",
          "topics": [
            {
              "id": "math-5-10-01",
              "he": "intitulé officiel en hébreu",
              "fr": "traduction française courte",
              "subtopics": [ { "he": "…", "fr": "…" } ],
              "source": "URL exacte du document lu"
            }
          ]
        }
      ]
    }
  ],
  "notes": ["remarques utiles, avec URL si c'est un fait"],
  "unverified": ["ce qui n'a pas pu être lu ou confirmé, avec la raison"]
}
```

- `grade` : `"10"`, `"11"`, `"12"`, ou `"all"` si le programme officiel n'est pas découpé par classe.
- `id` des thèmes : `<matière>-<unités>-<classe>-<nn>` (nn sur deux chiffres).
- `units` : nombre de יחידות לימוד (3, 4, 5, ou 2 pour les matières obligatoires).

## Facultés — `data/faculty/raw/<id>.json`

Identifiants : `openu` (האוניברסיטה הפתוחה), `technion`, `tau`, `biu`.

```json
{
  "id": "technion",
  "name": { "he": "הטכניון", "fr": "Technion" },
  "website": "https://…",
  "retrievedAt": "2026-11-10",
  "faculties": [
    { "id": "cs", "he": "…", "fr": "…", "url": "…", "mainDegrees": [ { "he": "…", "fr": "…" } ] }
  ],
  "foundationCourses": [
    {
      "id": "technion-104031",
      "family": "calculus1",
      "he": "nom officiel du cours",
      "fr": "traduction française courte",
      "code": "104031",
      "credits": 5.5,
      "facultiesServed": ["cs", "math"],
      "topics": [ { "he": "…", "fr": "…" } ],
      "prerequisites": ["…"],
      "source": "URL de la fiche du cours"
    }
  ],
  "notes": [],
  "unverified": []
}
```

Familles de cours (champ `family`) : `calculus1`, `calculus2`, `linear-algebra1`, `discrete-math`,
`probability`, `statistics`, `intro-programming`, `data-structures`, `physics-mechanics`,
`physics-electromagnetism`, `general-chemistry`, `organic-chemistry`, `intro-biology`,
`microeconomics`, `macroeconomics`, `financial-accounting`, `intro-psychology`,
`research-methods`, `academic-writing`, `intro-law`, ou `other-<slug>`.
