const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { seedFantasyPlayers } = require('../services/fantasySeeder');

// Middleware to authenticate user from JWT
const authenticateToken = require('../middleware/auth');

// Seed players (Admin route)
router.post('/seed', async (req, res) => {
  try {
    const total = await seedFantasyPlayers();
    res.json({ message: 'Seeding complete', total });
  } catch (err) {
    res.status(500).json({ error: 'Failed to seed players' });
  }
});

// Get all players available for draft
router.get('/players', authenticateToken, async (req, res) => {
  try {
    const players = await prisma.fantasyPlayer.findMany({
      orderBy: { name: 'asc' }
    });
    res.json(players);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch players' });
  }
});

// Create a new league
router.post('/league', authenticateToken, async (req, res) => {
  const { name } = req.body;
  try {
    const league = await prisma.fantasyLeague.create({
      data: {
        name,
        ownerId: req.user.id
      }
    });

    // Auto-create a team for the owner
    await prisma.fantasyTeam.create({
      data: {
        leagueId: league.id,
        userId: req.user.id,
        name: `${req.user.username}'s Team`
      }
    });

    res.json(league);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create league' });
  }
});

// Get user's leagues
router.get('/leagues', authenticateToken, async (req, res) => {
  try {
    const teams = await prisma.fantasyTeam.findMany({
      where: { userId: req.user.id },
      include: { league: true }
    });
    res.json(teams.map(t => t.league));
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch leagues' });
  }
});

// Get league details
router.get('/league/:id', authenticateToken, async (req, res) => {
  try {
    const league = await prisma.fantasyLeague.findUnique({
      where: { id: parseInt(req.params.id) },
      include: {
        teams: {
          include: {
            user: { select: { id: true, username: true } },
            players: { include: { player: true } },
            weeklyScores: true
          }
        }
      }
    });
    if (!league) return res.status(404).json({ error: 'League not found' });
    res.json(league);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch league' });
  }
});

// Join a league
router.post('/league/:id/join', authenticateToken, async (req, res) => {
  const { teamName } = req.body;
  try {
    const league = await prisma.fantasyLeague.findUnique({ where: { id: parseInt(req.params.id) } });
    if (!league) return res.status(404).json({ error: 'League not found' });
    if (league.status !== 'PREDRAFT') return res.status(400).json({ error: 'League already drafted' });

    const existingTeam = await prisma.fantasyTeam.findFirst({
      where: { leagueId: league.id, userId: req.user.id }
    });
    if (existingTeam) return res.status(400).json({ error: 'Already in this league' });

    const team = await prisma.fantasyTeam.create({
      data: {
        leagueId: league.id,
        userId: req.user.id,
        name: teamName || `${req.user.username}'s Team`
      }
    });
    res.json(team);
  } catch (err) {
    res.status(500).json({ error: 'Failed to join league' });
  }
});

// Manage Roster (Set Starter/Bench)
router.post('/team/:id/roster', authenticateToken, async (req, res) => {
  const { teamPlayerId, status } = req.body; // status: 'STARTER' or 'BENCH'
  try {
    // Verify ownership
    const team = await prisma.fantasyTeam.findUnique({ where: { id: parseInt(req.params.id) } });
    if (team.userId !== req.user.id) return res.status(403).json({ error: 'Not your team' });

    const updated = await prisma.fantasyTeamPlayer.update({
      where: { id: parseInt(teamPlayerId) },
      data: { status }
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update roster' });
  }
});

module.exports = router;
