import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { FirstRunChecklist, HELP_SEEN_KEY } from '../FirstRunChecklist';
import { HELP_ARTICLES, HELP_FAQ, helpMatch } from '../helpContent';

export function HelpPage() {
  const [query, setQuery] = useState('');
  const { hash } = useLocation();
  const term = query.trim();

  useEffect(() => {
    window.localStorage.setItem(HELP_SEEN_KEY, '1');
  }, []);

  useEffect(() => {
    const id = hash.replace(/^#/, '');
    if (id) document.getElementById(id)?.scrollIntoView();
  }, [hash]);

  const articles = term ? HELP_ARTICLES.filter((article) => helpMatch(article, term)) : HELP_ARTICLES;
  const faq = term ? HELP_FAQ.filter((item) => helpMatch(item, term)) : HELP_FAQ;
  const noResults = term.length > 0 && articles.length === 0 && faq.length === 0;

  return (
    <div className="lite-help">
      <h1>Ajuda</h1>
      <p className="lite-muted">
        Dúvidas rápidas sobre vendas, comissões, financeiro e permissões, com exemplos prontos e os
        erros mais comuns de cada tela.
      </p>

      <div className="lite-help-tools">
        <label className="field">
          <span>Buscar na ajuda</span>
          <input
            type="search"
            value={query}
            placeholder="Ex.: comissão, cancelar venda, permissão"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        {term.length > 0 ? (
          <span className="lite-muted">{articles.length + faq.length} resultado(s) para “{term}”.</span>
        ) : null}
      </div>

      {term.length === 0 ? (
        <nav className="lite-help-nav" aria-label="Índice da ajuda">
          {HELP_ARTICLES.map((article) => (
            <a key={article.id} href={`#${article.id}`}>
              {article.title}
            </a>
          ))}
          <a href="#faq">Dúvidas frequentes</a>
        </nav>
      ) : null}

      <FirstRunChecklist />

      {noResults ? (
        <p className="lite-empty">
          Nenhum resultado para “{term}”. Tente: vendas, comissões, permissão, importação.
        </p>
      ) : null}

      {articles.map((article) => (
        <section className="lite-card" id={article.id} key={article.id}>
          <h2>{article.title}</h2>
          <div className="help-block">
            <h3>O que esta tela resolve</h3>
            <p>{article.purpose}</p>
          </div>
          <div className="help-block">
            <h3>Quando usar</h3>
            <p>{article.when}</p>
          </div>
          {article.requiredFields.length > 0 ? (
            <div className="help-block">
              <h3>Campos obrigatórios</h3>
              <ul>
                {article.requiredFields.map((field) => (
                  <li key={field}>{field}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {article.example.length > 0 ? (
            <div className="help-block">
              <h3>Exemplo preenchido</h3>
              <ul>
                {article.example.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="help-block">
            <h3>Passo a passo</h3>
            <ol>
              {article.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>
          <div className="help-block">
            <h3>Erros comuns</h3>
            <ul>
              {article.commonErrors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </div>
          {(article.sections ?? []).map((section) => (
            <div className="help-block" key={section.title}>
              <h3>{section.title}</h3>
              <ul>
                {section.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
          <div className="help-block">
            <h3>Permissões necessárias</h3>
            <ul>
              {article.permissions.map((permission) => (
                <li key={permission}>{permission}</li>
              ))}
            </ul>
          </div>
          <div className="help-block">
            <h3>Se algo não aparecer</h3>
            <p>{article.missing}</p>
          </div>
          {article.availability ? (
            <p className="lite-help-tier">{article.availability}</p>
          ) : null}
        </section>
      ))}

      {faq.length > 0 ? (
        <section className="lite-card" id="faq">
          <h2>Dúvidas frequentes</h2>
          {faq.map((item) => (
            <div className="help-block" key={item.question}>
              <h3>{item.question}</h3>
              <p>{item.answer}</p>
            </div>
          ))}
        </section>
      ) : null}
    </div>
  );
}
