export function extractProposalCount(text) {
  const patterns = [
    /提案数\s*(\d+)\s*件/,
    /提案\s*(\d+)\s*件/,
    /提案\s*[：:]\s*(\d+)\s*件/,
    /(\d+)\s*件\s*の提案/,
    /(\d+)\s*件\s*提案/
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const count = parseInt(match[1], 10);
      if (count >= 0 && count <= 500) return count;
    }
  }
  return null;
}
