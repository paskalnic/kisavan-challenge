# Ki'Savan Challenge — tunnel enfant vers parent

Application statique déployée sur Cloudflare Pages, avec Cloudflare Pages Functions pour les API et Supabase pour les quiz, résultats, leads et événements de conversion.

## Parcours actuel

1. L'enfant réalise le quiz imposé par le site.
2. Le résultat affiche les compétences les mieux réussies et celles à consolider.
3. L'action principale crée un lien privé à envoyer à un parent avec le menu natif Android/iPhone.
4. Le parent arrive sur une page distincte et voit un aperçu pédagogique avant de laisser ses coordonnées.
5. Le premier formulaire demande seulement le prénom, l'e-mail et une préoccupation facultative.
6. Après validation, une seconde étape facultative propose un échange téléphonique.
7. Les étapes importantes du tunnel sont enregistrées dans `funnel_events`.

Le classement a été retiré du parcours afin de ne pas concurrencer l'action principale vers le parent.

## Déploiement d'une mise à jour

### 1. Mettre Supabase à niveau

Dans le projet Supabase utilisé en production :

1. ouvrir **SQL Editor** ;
2. créer une nouvelle requête ;
3. copier tout le contenu de `supabase-schema.sql` ;
4. exécuter la requête.

Le script est non destructif pour les anciennes tentatives. Le nouveau diagnostic utilise le slug versionné :

```text
francais-5e-diagnostic-v2
```

### 2. Publier le code

```bash
git add .
git commit -m "Amelioration du tunnel parent et du diagnostic"
git push origin main
```

Cloudflare Pages redéploie normalement automatiquement la branche `main`.

### 3. Vérifier les secrets Cloudflare

Dans **Cloudflare Pages → Settings → Variables and Secrets** :

```text
SUPABASE_URL
SUPABASE_SECRET_KEY
```

`SUPABASE_SECRET_KEY` doit contenir une clé Supabase secrète utilisable uniquement côté serveur. Elle ne doit jamais être inscrite dans `public/` ni envoyée au navigateur.

## Choisir le quiz affiché

Le visiteur ne choisit pas le niveau ou la matière. Le quiz est imposé par cette constante dans `public/app.module.js` :

```js
export const ACTIVE_QUIZ_SLUG = "francais-5e-diagnostic-v2";
```

Pour afficher un autre quiz, remplacer uniquement cette valeur par le slug exact du quiz créé dans Supabase, puis pousser le changement sur GitHub.

## Ajouter un nouveau quiz

Créer le quiz dans **Supabase → SQL Editor**. Exemple :

```sql
do $$
declare
  new_quiz_id uuid;
begin
  insert into public.quizzes (
    slug,
    title,
    week_label,
    level,
    subject,
    active
  )
  values (
    'maths-4e-calcul-v1',
    'Diagnostic maths 4e',
    '10 questions · calcul et raisonnement',
    '4e',
    'maths',
    true
  )
  returning id into new_quiz_id;

  insert into public.questions (
    quiz_id,
    prompt,
    explanation,
    choices,
    correct_index,
    position,
    skill_code,
    skill_label
  )
  values
    (
      new_quiz_id,
      'Combien vaut 3 × 7 ?',
      '3 multiplié par 7 donne 21.',
      '["18","21","24","27"]'::jsonb,
      1,
      1,
      'calcul',
      'Calcul numérique'
    ),
    (
      new_quiz_id,
      'Combien vaut 40 ÷ 5 ?',
      '40 partagé en 5 parts égales donne 8.',
      '["5","8","10","12"]'::jsonb,
      1,
      2,
      'calcul',
      'Calcul numérique'
    );
end $$;
```

`correct_index` commence à zéro :

```text
0 = première réponse
1 = deuxième réponse
2 = troisième réponse
3 = quatrième réponse
```

Chaque grande compétence devrait idéalement avoir au moins deux questions partageant le même `skill_code` et le même `skill_label`. C'est ce regroupement qui produit le bilan par compétence.

### Règle importante de versionnement

Dès qu'un quiz possède des tentatives réelles, éviter de remplacer ses questions. Créer plutôt une nouvelle version :

```text
francais-5e-diagnostic-v2
francais-5e-diagnostic-v3
```

Puis modifier `ACTIVE_QUIZ_SLUG`. Cette méthode conserve la cohérence des anciens résultats.

## Données utiles dans Supabase

### Examiner les nouveaux leads

```sql
select *
from public.parent_lead_review
order by lead_created_at desc;
```

La vue contient notamment :

- les coordonnées du parent ;
- sa principale préoccupation ;
- sa demande éventuelle de rappel ;
- son moment de contact préféré ;
- le score global ;
- le résumé par compétence ;
- chaque mauvaise réponse, la bonne réponse et l'explication.

Le champ `lead_status` peut être mis à jour manuellement avec une organisation simple :

```text
new
contacted
qualified
customer
lost
```

Exemple :

```sql
update public.parent_leads
set lead_status = 'contacted', updated_at = now()
where id = 'ID_DU_LEAD';
```

### Analyser le tunnel

```sql
select *
from public.funnel_event_summary
order by event_day desc, event_name;
```

Événements principaux :

```text
quiz_viewed
quiz_started
question_answered
quiz_completed
parent_share_clicked
parent_share_link_created
share_menu_opened
parent_share_completed
share_link_opened
lead_form_viewed
lead_form_submitted
callback_requested
friend_share_clicked
friend_share_completed
```

Les variantes `A` et `B` du bouton parent sont conservées dans `cta_variant`. Pour comparer les performances :

```sql
select
  cta_variant,
  event_name,
  count(*) as total
from public.funnel_events
where cta_variant is not null
group by cta_variant, event_name
order by cta_variant, event_name;
```

Ne pas tirer de conclusion sur une variante avec seulement quelques visites. Attendre un volume suffisant et comparer surtout les ouvertures du lien parent et les formulaires envoyés.

## Partage social

Le partage parent utilise une route privée :

```text
/bilan/<jeton-prive>
```

Cette route fournit une carte Open Graph rassurante, puis ouvre l'application sur le résultat correspondant.

Le partage entre amis utilise :

```text
/partage/challenge
```

Cette route fournit une carte visuelle différente et renvoie vers le quiz, sans exposer le résultat de l'enfant.

Images utilisées :

```text
public/assets/share-parent.png
public/assets/share-challenge.png
```

## Tests

Installer les dépendances :

```bash
npm ci
```

Lancer toute la suite :

```bash
npm test
```

Les tests couvrent le front, les API Cloudflare, le diagnostic par compétence, le partage, les formulaires, le suivi du tunnel et les routes d'aperçu social.

## Structure principale

```text
public/
  index.html
  style.css
  app.js
  app.module.js
  assets/
functions/
  api/
    quiz.js
    submit.js
    share.js
    shared-result.js
    lead.js
    event.js
  bilan/[token].js
  partage/challenge.js
supabase-schema.sql
```
