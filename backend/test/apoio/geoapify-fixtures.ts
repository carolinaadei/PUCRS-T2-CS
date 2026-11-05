/** Formato GeoJSON documentado pelo fornecedor; IDs ficticios, nenhuma chave real. */
export const cidadeGeoapify = {
  features: [
    {
      properties: {
        place_id: 'cidade-canonica',
        name: 'Porto',
        city: 'Porto',
        country: 'Portugal',
        country_code: 'pt',
        lat: 41.1496,
        lon: -8.6109,
        categories: ['administrative.city_level'],
      },
    },
  ],
};

export const atividadeGeoapify = {
  features: [
    {
      properties: {
        place_id: 'atividade-canonica',
        name: 'Torre dos Clerigos',
        city: 'Porto',
        country: 'Portugal',
        country_code: 'pt',
        lat: 41.1457,
        lon: -8.6146,
        formatted: 'Rua de Sao Filipe de Nery, Porto',
        categories: ['tourism.sights'],
        datasource: {
          attribution: '© OpenStreetMap contributors',
          url: 'https://www.openstreetmap.org/copyright',
        },
      },
    },
  ],
};

export const respostaGeoapify = (dados: unknown, status = 200) =>
  new Response(JSON.stringify(dados), { status, headers: { 'content-type': 'application/json' } });
