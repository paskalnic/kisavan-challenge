create extension if not exists pgcrypto;
create table if not exists public.quizzes (id uuid primary key default gen_random_uuid(),title text not null,week_label text not null,level text not null,subject text not null,active boolean not null default false,created_at timestamptz not null default now());
create table if not exists public.questions (id uuid primary key default gen_random_uuid(),quiz_id uuid not null references public.quizzes(id) on delete cascade,prompt text not null,choices jsonb not null check(jsonb_typeof(choices)='array'),correct_index integer not null check(correct_index>=0),position integer not null,unique(quiz_id,position));
create table if not exists public.attempts (id uuid primary key default gen_random_uuid(),quiz_id uuid not null references public.quizzes(id) on delete cascade,alias text not null,score integer not null,total integer not null,duration_ms integer not null,public_token uuid not null unique,created_at timestamptz not null default now());
create index if not exists attempts_board_idx on public.attempts(quiz_id,score desc,duration_ms asc);
revoke all on table public.quizzes from anon,authenticated; revoke all on table public.questions from anon,authenticated; revoke all on table public.attempts from anon,authenticated;
grant select,insert,update,delete on table public.quizzes to service_role; grant select,insert,update,delete on table public.questions to service_role; grant select,insert,update,delete on table public.attempts to service_role;
alter table public.quizzes enable row level security; alter table public.questions enable row level security; alter table public.attempts enable row level security;
with new_quiz as (insert into public.quizzes(title,week_label,level,subject,active) values('Maths 5e : fractions','Semaine test','5e','maths',true) returning id)
insert into public.questions(quiz_id,prompt,choices,correct_index,position)
select id,'Combien vaut 1/2 + 1/4 ?','["2/6","3/4","1/6","2/4"]'::jsonb,1,1 from new_quiz
union all select id,'Quelle fraction est égale à 0,5 ?','["1/5","2/5","1/2","5/2"]'::jsonb,2,2 from new_quiz
union all select id,'Combien vaut 3/4 de 20 ?','["5","10","15","18"]'::jsonb,2,3 from new_quiz
union all select id,'Quelle fraction est la plus grande ?','["2/3","3/5","1/2","4/9"]'::jsonb,0,4 from new_quiz
union all select id,'Simplifie 6/8.','["3/4","2/3","1/2","6/4"]'::jsonb,0,5 from new_quiz;
