# Runbook de Search Console, analytics e Web Vitals

Estas tarefas exigem acesso a DNS e contas externas. Nenhuma delas está marcada como
concluída pelo código do repositório.

## 1. Google Search Console

- [ ] Criar propriedade de domínio para `raio-x-2026.com.br`.
- [ ] Publicar o TXT de verificação no DNS.
- [ ] Esperar propagação e registrar screenshot/data da verificação.
- [ ] Enviar `https://raio-x-2026.com.br/sitemap.xml`.
- [ ] Confirmar “processado com sucesso”; não basta clicar em enviar.
- [ ] Inspecionar home, `/eleicoes-2026` e cinco perfis já aprovados pelo gate.
- [ ] Registrar canonical declarado/escolhido e status de indexação de cada amostra.

`GOOGLE_SITE_VERIFICATION` habilita verificação por meta tag como apoio, mas a propriedade
de domínio via DNS continua preferível. Não commitar o valor.

## 2. Baseline obrigatória

Exportar e guardar com data:

| Grupo | Enviadas | Descobertas | Rastreadas | Indexadas | Principal exclusão |
| --- | ---: | ---: | ---: | ---: | --- |
| Home/editoriais |  |  |  |  |  |
| Candidatos |  |  |  |  |  |
| Cargo/UF |  |  |  |  |  |
| Temas |  |  |  |  |  |
| Comparações |  |  |  |  |  |

Também exportar consultas e páginas dos últimos 7 e 28 dias para permitir comparação.

## 3. GA4 opcional

1. Confirmar política de cookies/consentimento com o responsável de privacidade.
2. Criar uma propriedade e um fluxo Web somente depois dessa decisão.
3. Configurar `NEXT_PUBLIC_GA_MEASUREMENT_ID=G-...` no ambiente do frontend.
4. Validar no DebugView sem tráfego interno contaminando relatórios.
5. Registrar a configuração e a política aplicável.

Sem essa variável, nenhum script GA4 é carregado. O código não declara GA4 concluído.

## 4. Core Web Vitals reais

`WebVitalsReporter` envia CLS, INP, LCP, FCP e TTFB para `/api/web-vitals` por padrão.
A rota valida o payload e produz log estruturado `[web-vital]`. Para operar:

- [ ] conectar os logs do frontend ao agregador adotado;
- [ ] criar p75 móvel e desktop por template;
- [ ] alertar para LCP acima de 2,5 s, INP a partir de 200 ms ou CLS a partir de 0,1;
- [ ] configurar `NEXT_PUBLIC_WEB_VITALS_ENDPOINT` somente se houver coletor alternativo;
- [ ] excluir bots e ambientes internos do painel.

O valor só é uma baseline de campo depois de haver amostra suficiente. Lighthouse local
não substitui dados reais de usuários.

## 5. Eventos mínimos

- visualização de perfil;
- clique em fonte;
- uso da busca;
- seleção e conclusão de comparação;
- pedido de correção;
- navegação de landing para perfil.

Antes de implementar eventos adicionais, documentar finalidade e retenção. Não enviar nome,
e-mail, termo sensível ou outro dado pessoal como dimensão analítica.
