# Presuntinho — Deep Product Polish: pesquisa e plano técnico

> Nota interna criada para a fase “Deep Product Polish”. Fonte principal: pesquisa oficial/externa sobre Duolingo, motion/haptics e auditoria local do repo.

## Síntese curta da pesquisa

### O que vamos “roubar” do Duolingo

- **Loop emocional curto:** progresso claro → micro-vitória → recompensa → vontade de voltar amanhã.
- **Caminho guiado:** transformar Home/Escola de listas soltas em próximos passos pequenos, visuais e sequenciais.
- **Streak flexível:** sequência diária com recuperação gentil, sem culpa nem punição agressiva.
- **XP/recompensas cosméticas:** reforço frequente, leve e previsível; usar surpresa só como mimo.
- **Mascote com estados:** Presuntinho reage a mood, hora, progresso, erro, regresso e milestones.
- **Micro-interacções consistentes:** press states, confetti curto, progresso animado, feedback imediato, `prefers-reduced-motion`.
- **Microcopy como produto:** frases pt-PT curtas, carinhosas, contextuais e localizáveis.

Fontes usadas pela pesquisa: Duolingo blog sobre streaks, milestone animation, new home/learning path, personagens/gamification, widgets, copy testing, Friends Quests; Apple HIG haptics; Material 3 motion; MDN `prefers-reduced-motion`.

### O que não vamos copiar

- Visual/coruja/paleta/frases do Duolingo.
- Tom passivo-agressivo ou culpabilizante.
- Perder progresso de forma punitiva.
- Vidas que bloqueiam a experiência principal.
- Leaderboards cedo demais.
- Excesso de animação ou badges sem significado.
- Dark patterns de retenção.

### O que combina com Presuntinho/Fatma

- **Fofo premium:** carinho, humor leve, visual polido, nunca infantilizado.
- **Mood-aware:** Sick/Sad/Love mudam microcopy, acentos, cards e nudges, sem bloquear a app.
- **Cuidado acima de produtividade:** Sick Mode deve sugerir água/descanso/tarefas leves, não pressionar.
- **Lore próprio:** Presuntinho como mascote cúmplice, com pequenos segredos e reacções.
- **Progressão útil:** Escola, calendário, hábitos e agente ajudam a decidir o próximo passo real.

## Plano técnico/design

### 1. Heart Button / botão carinho

- Componente exacto: `src/lib/components/HeartButton.svelte`, montado em `src/routes/+layout.svelte` dentro de `.fab-stack`.
- Posição deve ser estável via `.fab-stack` fixa; animações apenas em `transform`, `opacity`, `filter`, `box-shadow`.
- Remover sensação de quadrado azul com `-webkit-tap-highlight-color: transparent` e focus ring custom acessível.
- O botão não deve desaparecer por click; em `/agente` está oculto por design via `isAgentRoute`, mas não deve “piscar” em rotas normais.
- FAB/nav/mood: elementos decorativos `pointer-events: none`; controlos reais `pointer-events: auto`.

### 2. Feedback exponencial/confetti

- Medir clicks recentes numa janela curta (~1200ms).
- Calcular `burstLevel` e quantidade quadrática controlada, com limite para performance.
- Click isolado: pequeno mimo.
- Vários clicks: mais partículas, halo, label curto.
- Spam rápido: explosão forte/“violenta” mas bonita, sem congelar.
- Confetti deve poder nascer junto ao coração (`origin: heart`) e não só cair do topo.
- Respeitar `prefers-reduced-motion`; limpar timers e remover partículas.

### 3. Mood System

- `src/lib/mood.ts` continua fonte de arquitectura: `activateMood`, `readActiveMood`, `clearActiveMood`, `acknowledgeMoodIntro`, `MOOD_EVENT`, `MOOD_META`.
- Settings deve seleccionar `normal`, `love`, `sad`, `sick` usando os mesmos helpers dos locks/passwords.
- Mood é persistente e pode futuramente ser activado por agente/Hermes com `activateMood(kind, 'agent')`.
- Mood deve afectar app inteira por tokens/contexto (`--mood-accent`, meta/microcopy), não hacks isolados.

### 4. Temas

- Separação conceptual:
  - **Theme:** estética escolhida pelo utilizador.
  - **Mood:** camada emocional/contextual temporária/persistente.
- Usar tokens semânticos (`--bg`, `--bg-elev`, `--txt`, `--txt2`, `--accent`, `--border`, `--card`).
- Adicionar temas profissionais/bonitos e garantir legibilidade em rotas com CSS local antigo.
- Mood pode sobrepor acento/glow, mas não deve destruir a paleta do theme.

### 5. i18n

- pt-PT é fonte de verdade.
- Todo texto novo deve entrar em `src/lib/i18n/*.json` para `pt-PT`, `en`, `fr`, `ar`, `tn`.
- Preservar placeholders (`{mood}`, `{xp}`, etc.).
- Hardcoded lore só deve ficar quando for nome próprio/intencional; copy visível deve migrar gradualmente.

### 6. Escola/lições

- Evoluir de catálogo para caminho: passos pequenos, lição actual, revisão, quiz, recompensa.
- Estados: available/current/completed/locked em cards/nodes.
- XP e streak devem reforçar acções úteis, não abrir páginas por acidente.
- Hearts/vidas apenas em modo desafio/quiz, sem bloquear aprendizagem principal.

### 7. Home

- Home deve ser hub emocional/produtivo:
  - saudação;
  - mood actual;
  - progresso;
  - próxima acção;
  - escola/calendário/vida/agente;
  - easter eggs/lore.
- Menos “colecção de cards”, mais “o que faço agora?”.
- Cards devem responder ao mood sem impedir navegação.

### 8. Lore/easter eggs

- Presuntinho deve ter personalidade: cuidador no Sick, cúmplice no Love, calmo no Sad.
- Easter eggs por clicks rápidos, mood activo, conclusão de lição, idioma, datas/horas.
- Elegante e discreto; evitar casino visual constante.

## Decisões desta implementação

- Implementar primeiro a camada base: selector de mood, novos temas, HeartButton/confetti exponencial, Home mood-aware e Escola com primeiro “path” visual.
- Não adicionar áudio/haptics nativos agora porque não há infra cross-platform consistente já existente.
- Não implementar leaderboards/social agora.
- Não bloquear a experiência principal com vidas; “3 vidas” aparece como linguagem de desafio, não gate real.
- Manter validação obrigatória antes de commit/push.
