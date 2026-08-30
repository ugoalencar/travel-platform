import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { App } from '../App';

export function renderRouted(initialEntry = '/'): ReturnType<typeof render> {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <App />
    </MemoryRouter>,
  );
}

export function renderAt(element: ReactElement, initialEntry = '/'): ReturnType<typeof render> {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/offers/:id" element={element} />
        <Route path="/customers/:id" element={element} />
        <Route path="/wishes/:id" element={element} />
        <Route path="/trips/:id" element={element} />
        <Route path="*" element={element} />
      </Routes>
    </MemoryRouter>,
  );
}
