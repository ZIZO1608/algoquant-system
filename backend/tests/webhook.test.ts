import { describe, it, expect } from 'vitest';
import { parseBotExtraData } from '../src/services/webhook.service.js';
import { BOT_EXTRA_DATA_KEYS } from '../src/config/index.js';

describe('webhook bot field parsing', () => {
  it('extracts all known extra_data keys from query params', () => {
    const query: Record<string, string> = {
      full_name: 'أحمد',
      phone: '+963991234567',
      interest_area: 'AI',
      main_goal: 'Learn automation',
      repetitive_task: 'Data entry',
      lead_classification: 'hot',
      seriousness_level: 'high',
      ready_to_register: 'yes',
      needs_a_call: 'true',
      city: 'Damascus',
      occupation_type: 'engineer',
      ai_experience_score: '3',
      preferred_contact_times: 'evening',
      preferred_contact_method: 'whatsapp',
      recommendation_reason: 'Strong fit',
    };

    const extra = parseBotExtraData(query);

    for (const key of BOT_EXTRA_DATA_KEYS) {
      expect(extra[key]).toBeDefined();
    }
    expect(extra.interest_area).toBe('AI');
    expect(extra.lead_classification).toBe('hot');
    expect(extra.ready_to_register).toBe('yes');
  });

  it('parses bundled notes field', () => {
    const query = {
      notes: 'interest_area: Trading; lead_classification: warm; ready_to_register: no; city: Aleppo',
    };
    const extra = parseBotExtraData(query);
    expect(extra.interest_area).toBe('Trading');
    expect(extra.lead_classification).toBe('warm');
    expect(extra.city).toBe('Aleppo');
  });

  it('passes through unknown keys', () => {
    const query = { custom_future_field: 'value' };
    const extra = parseBotExtraData(query);
    expect(extra.custom_future_field).toBe('value');
  });

  it('maps bot field aliases to ERP canonical keys', () => {
    const query = {
      preferred_times: 'evenings',
      contact_method: 'whatsapp',
      needs_call: 'true',
      ai_experience_level: '3',
    };
    const extra = parseBotExtraData(query);

    expect(extra.preferred_contact_times).toBe('evenings');
    expect(extra.preferred_contact_method).toBe('whatsapp');
    expect(extra.needs_a_call).toBe('true');
    expect(extra.ai_experience_score).toBe('3');
    expect(extra.preferred_times).toBeUndefined();
    expect(extra.contact_method).toBeUndefined();
    expect(extra.needs_call).toBeUndefined();
    expect(extra.ai_experience_level).toBeUndefined();
  });

  it('prefers canonical keys when both alias and canonical are present', () => {
    const query = {
      preferred_times: 'mornings',
      preferred_contact_times: 'evenings',
      ai_experience_level: '1',
      ai_experience_score: '5',
    };
    const extra = parseBotExtraData(query);

    expect(extra.preferred_contact_times).toBe('evenings');
    expect(extra.ai_experience_score).toBe('5');
    expect(extra.preferred_times).toBeUndefined();
    expect(extra.ai_experience_level).toBeUndefined();
  });

  it('remaps alias keys from bundled notes', () => {
    const query = {
      notes: 'preferred_times: evenings; needs_call: true; contact_method: phone',
    };
    const extra = parseBotExtraData(query);

    expect(extra.preferred_contact_times).toBe('evenings');
    expect(extra.needs_a_call).toBe('true');
    expect(extra.preferred_contact_method).toBe('phone');
    expect(extra.preferred_times).toBeUndefined();
    expect(extra.needs_call).toBeUndefined();
    expect(extra.contact_method).toBeUndefined();
  });

  it('passes through proposal bot fields unchanged', () => {
    const query = {
      workshop_title: 'AI for Sales',
      idea_description: 'Automate follow-ups',
      problem_to_solve: 'Manual CRM updates',
    };
    const extra = parseBotExtraData(query);

    expect(extra.workshop_title).toBe('AI for Sales');
    expect(extra.idea_description).toBe('Automate follow-ups');
    expect(extra.problem_to_solve).toBe('Manual CRM updates');
  });
});
