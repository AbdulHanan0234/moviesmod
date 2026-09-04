const tagRules = [
  {
    name: "English",
    test: (m) => m.lang === "English",
  },
  {
    name: "Hindi",
    test: (m) => m.lang === "Hindi",
  },
  {
    name: "Multi Audio",
    test: (m) => m.lang === "Dubbed" || m.lang === "Multi Audio",
  },
  {
    name: "Spanish",
    test: () => false,
    extraIds: [1, 8, 45, 118, 162],
  },
  {
    name: "Netflix",
    test: () => false,
    extraIds: [7, 8, 22, 68, 179],
  },
  {
    name: "2026",
    test: (m) => {
      const year = m.uploadedAt ? new Date(m.uploadedAt).getFullYear() : null;
      return year === 2026;
    },
  },
  {
    name: "Drama Series",
    test: (m) => m.type === "Series" && m.genre === "Drama",
  },
  {
    name: "Spanish Series",
    test: (m) => m.lang === "Spanish" && m.type === "Series",
    extraIds: [7, 8, 20, 23, 24],
  },
];

export const getTags = () => tagRules.map((t) => ({ name: t.name }));

export const getMoviesForTag = (name, movies = []) => {
  const rule = tagRules.find(
    (t) => t.name.toLowerCase() === String(name).toLowerCase()
  );
  if (!rule) return [];

  const matched = movies.filter(rule.test).map((m) => m.id);
  const extras = (rule.extraIds || []).filter((id) => !matched.includes(id));
  const ids = [...new Set([...matched, ...extras])];

  return movies.filter((m) => ids.includes(m.id));
};