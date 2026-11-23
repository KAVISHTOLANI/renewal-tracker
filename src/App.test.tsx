import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';

const KEY = 'renewal-radar:store';

describe('Renewal Radar', () => {
  it('lists what to act on and draws the radar', () => {
    window.location.hash = '/radar';
    render(<App />);
    expect(screen.getByRole('img', { name: /Radar of \d+ renewals/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Climbing gym membership/ })).toBeInTheDocument();
    expect(screen.getAllByText('Expired').length).toBeGreaterThan(0);
  });

  it('masks a reference until revealed', async () => {
    window.location.hash = '/item/demo-passport-sam';
    const user = userEvent.setup();
    render(<App />);
    expect(screen.getByTestId('ref')).toHaveTextContent('••••1937');
    await user.click(screen.getByRole('button', { name: 'Show' }));
    expect(screen.getByTestId('ref')).toHaveTextContent('P4821937');
  });

  it('records a renewal with validation and resets the checklist', async () => {
    window.location.hash = '/item/demo-passport-sam';
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('checkbox', { name: /New photo/ }));
    expect(screen.getByText('1 of 3 done')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'I’ve renewed this' }));
    await user.clear(screen.getByLabelText('New expiry'));
    await user.type(screen.getByLabelText('New expiry'), '2020-01-01');
    await user.click(screen.getByRole('button', { name: 'Save renewal' }));
    expect(screen.getByText(/after the current one/)).toBeInTheDocument();
    await user.clear(screen.getByLabelText('New expiry'));
    await user.type(screen.getByLabelText('New expiry'), '2040-06-01');
    await user.click(screen.getByRole('button', { name: 'Save renewal' }));
    expect(screen.getByText(/Renewed — now expires/)).toBeInTheDocument();
    expect(screen.getByText('0 of 3 done')).toBeInTheDocument();
  });

  it('suggests a lead time by type and validates the form', async () => {
    localStorage.setItem(KEY, JSON.stringify({ items: [] }));
    window.location.hash = '/item/new';
    const user = userEvent.setup();
    render(<App />);
    await user.selectOptions(screen.getByLabelText('Type'), 'Insurance');
    expect(screen.getByLabelText('Start renewing this many days before')).toHaveValue('21');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText('Name the document or membership.')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Name'), 'Pet insurance');
    await user.type(screen.getByLabelText('Expires'), '2030-05-10');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByTestId('start-by')).toHaveTextContent(/Apr.*2030|19.*Apr|2030/);
  });

  it('shows the calendar with an export button', () => {
    window.location.hash = '/calendar';
    render(<App />);
    expect(screen.getByRole('button', { name: 'Download .ics' })).toBeEnabled();
    expect(screen.getAllByText('Start renewing').length).toBeGreaterThan(0);
  });
});
