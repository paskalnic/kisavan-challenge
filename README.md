# Challenge Ki'Savan — Cloudflare Pages + Supabase

Application de quiz mobile avec :

- une tentative par quiz et par navigateur ;
- un surnom anonyme pour le classement ;
- l'enregistrement du score et de chaque réponse dans Supabase ;
- un lien privé permettant d'envoyer le résultat à un parent ;
- le partage natif Android/iPhone avec copie du lien en secours ;
- un formulaire parent court : prénom et e-mail obligatoires, téléphone et code postal facultatifs ;
- des consentements séparés pour le rappel et les communications commerciales.

## Parcours utilisateur

1. L'enfant réalise le quiz sans fournir de coordonnées.
2. À la fin, il peut :
   - envoyer un lien privé de bilan à un parent ;
   - copier ce lien ;
   - partager le challenge avec ses amis.
3. Le parent ouvre une URL de la forme `/?bilan=<jeton-prive>`.
4. Le parent voit un aperçu du résultat et peut demander le bilan gratuit.
5. Le lead est relié à la tentative et aux réponses enregistrées.

Le résultat terminé est conservé dans `localStorage`. Après un rechargement de la page, l'utilisateur peut donc encore partager son bilan sans refaire le quiz.

## Installation Supabase

Exécuter le fichier `supabase-schema.sql` dans l'éditeur SQL Supabase.

Le script est idempotent : il crée les nouvelles tables et ajoute les colonnes manquantes sans supprimer les anciennes données. Il corrige notamment l'ancienne incohérence où l'API envoyait `postal_code` alors que cette colonne n'était pas définie dans le schéma fourni.

Tables principales :

- `quizzes`
- `questions`
- `attempts`
- `attempt_answers`
- `attempt_shares`
- `parent_leads`

La vue `parent_lead_review` rassemble les coordonnées du parent, le score et le détail des réponses fausses. Dans l'éditeur SQL Supabase :

```sql
select *
from public.parent_lead_review
order by lead_created_at desc;
```

La colonne `mistakes` contient, pour chaque erreur :

- la question ;
- la réponse choisie ;
- la bonne réponse ;
- l'explication pédagogique.

## Configuration Cloudflare Pages

Dans les variables d'environnement du projet Cloudflare Pages, définir :

- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY`

La clé secrète Supabase reste uniquement dans les Pages Functions. Elle ne doit jamais être placée dans `public/` ni envoyée au navigateur.

Configuration de déploiement recommandée :

- commande de build : aucune ;
- dossier de sortie : `public` ;
- fonctions : le dossier `functions/` est détecté automatiquement par Cloudflare Pages.

Nouveaux endpoints :

- `POST /api/share` : crée ou retrouve le lien privé d'une tentative ;
- `GET /api/shared-result?token=...` : fournit l'aperçu autorisé au parent ;
- `POST /api/lead` : enregistre le lead depuis le résultat direct ou le lien parent.

## Tests

```bash
npm ci
npm test
```

La commande utilise un seul processus Vitest afin d'être stable aussi dans les environnements disposant de peu de mémoire.

## Limites du MVP

- La limitation à une tentative repose sur `localStorage` et ne bloque pas totalement la triche.
- Pour un concours avec récompense, ajouter Cloudflare Turnstile, une limitation de débit et un règlement.
- Le lien parent est difficile à deviner grâce à un UUID, mais toute personne qui possède ce lien peut voir l'alias et le score associés.
- Le menu de partage dépend des applications installées sur le téléphone. Le bouton de copie reste disponible en solution de secours.

## Choisir le quiz affiché sur le site

Le visiteur ne choisit ni le niveau ni la matière. Le quiz affiché est imposé dans :

```js
// public/app.module.js
export const ACTIVE_QUIZ_SLUG = "francais-5e-diagnostic";
```

Pour afficher un autre quiz, remplace uniquement cette valeur par le `slug` du nouveau quiz, puis pousse le changement sur GitHub.

## Ajouter un nouveau quiz

Dans Supabase > SQL Editor, exécute un bloc sur ce modèle :

```sql
do $$
declare
  new_quiz_id uuid;
begin
  insert into public.quizzes (slug, title, week_label, level, subject, active)
  values ('maths-4e-calcul', 'Diagnostic maths 4e', 'Calcul et raisonnement', '4e', 'maths', true)
  returning id into new_quiz_id;

  insert into public.questions (quiz_id, prompt, explanation, choices, correct_index, position)
  values
    (new_quiz_id, 'Question 1 ?', 'Explication.', '["Réponse A","Réponse B","Réponse C","Réponse D"]'::jsonb, 1, 1),
    (new_quiz_id, 'Question 2 ?', 'Explication.', '["Réponse A","Réponse B","Réponse C","Réponse D"]'::jsonb, 0, 2);
end $$;
```

Règles importantes :

- `slug` doit être unique, sans espace ni accent ;
- `correct_index` commence à 0 : 0 = première réponse, 1 = deuxième, etc. ;
- `position` définit l'ordre des questions ;
- mets ensuite ce même `slug` dans `ACTIVE_QUIZ_SLUG` ;
- `active = false` permet de conserver un quiz dans la base sans qu'il soit accessible.
