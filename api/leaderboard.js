import { getDB } from './db';

export default async function handler(req, res) {
  const db = await getDB();

  if (req.method === 'POST') {
    // Add new score
    try {
      const { name, score } = JSON.parse(req.body);
      
      if (!name || !score) {
        return res.status(400).json({ error: 'Name and score are required' });
      }

      // Check if player already exists
      const existingPlayer = await db.get(
        'SELECT * FROM leaderboard WHERE name = ?',
        [name]
      );

      if (existingPlayer) {
        // Update score only if new score is higher
        if (score > existingPlayer.score) {
          await db.run(
            'UPDATE leaderboard SET score = ?, updated_at = CURRENT_TIMESTAMP WHERE name = ?',
            [score, name]
          );
        }
      } else {
        // Add new player
        await db.run(
          'INSERT INTO leaderboard (name, score) VALUES (?, ?)',
          [name, score]
        );
      }

      res.status(200).json({ success: true });
    } catch (error) {
      console.error('Error adding score:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  } else if (req.method === 'GET') {
    // Get top 5 scores
    try {
      const scores = await db.all(
        'SELECT name, score FROM leaderboard ORDER BY score DESC LIMIT 5'
      );
      
      res.status(200).json(scores);
    } catch (error) {
      console.error('Error getting scores:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  } else {
    res.setHeader('Allow', ['GET', 'POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
