'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { io } from 'socket.io-client';

export default function DraftRoom({ params }) {
  const { id } = params;
  const router = useRouter();
  const [socket, setSocket] = useState(null);
  
  const [league, setLeague] = useState(null);
  const [teams, setTeams] = useState([]);
  const [picks, setPicks] = useState([]);
  const [availablePlayers, setAvailablePlayers] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [status, setStatus] = useState('LOADING');
  const [currentPickIndex, setCurrentPickIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch initial data
  useEffect(() => {
    const fetchData = async () => {
      try {
        const userRes = await axios.get('http://localhost:5000/api/auth/me', { withCredentials: true });
        setCurrentUser(userRes.data);

        const leagueRes = await axios.get(`http://localhost:5000/api/fantasy/league/${id}`, { withCredentials: true });
        setLeague(leagueRes.data);

        const playersRes = await axios.get('http://localhost:5000/api/fantasy/players', { withCredentials: true });
        setAvailablePlayers(playersRes.data);
      } catch (err) {
        console.error(err);
      }
    };
    fetchData();
  }, [id]);

  // Setup sockets
  useEffect(() => {
    const token = localStorage.getItem('smack_token');
    const newSocket = io('http://localhost:5000', {
      auth: token ? { token } : {},
      transports: ['websocket', 'polling']
    });
    setSocket(newSocket);

    newSocket.on('connect', () => {
      newSocket.emit('join_draft', { leagueId: id });
    });

    newSocket.on('draft_state', (state) => {
      setStatus(state.status);
      setCurrentPickIndex(state.currentPickIndex);
      setTeams(state.teams);
      setPicks(state.picks);
    });

    newSocket.on('draft_started', (data) => {
      setStatus(data.status);
      setCurrentPickIndex(data.currentPickIndex);
      setTeams(data.teams);
    });

    newSocket.on('pick_made', (data) => {
      setPicks(prev => [...prev, data.pick]);
      setCurrentPickIndex(data.nextPickIndex);
      setStatus(data.status);
    });

    newSocket.on('draft_error', (data) => {
      alert(data.message);
    });

    return () => newSocket.close();
  }, [id]);

  if (!currentUser || !league) return <div className="page-container">Loading Draft Room...</div>;

  const myTeam = teams.find(t => t.userId === currentUser.id);
  const isOwner = league.ownerId === currentUser.id;

  const startDraft = () => {
    if (socket) socket.emit('start_draft', { leagueId: id });
  };

  const draftPlayer = (playerId) => {
    if (!myTeam) return;
    if (socket) {
      socket.emit('draft_pick', {
        leagueId: id,
        teamId: myTeam.id,
        playerId
      });
    }
  };

  // Calculate whose turn it is
  let currentTeamTurn = null;
  const numTeams = teams.length;
  if (status === 'DRAFTING' && numTeams > 0) {
    const round = Math.floor(currentPickIndex / numTeams);
    const pickInRound = currentPickIndex % numTeams;
    const expectedDraftOrder = (round % 2 === 0) ? (pickInRound + 1) : (numTeams - pickInRound);
    currentTeamTurn = teams.find(t => t.draftOrder === expectedDraftOrder);
  }

  const isMyTurn = currentTeamTurn && myTeam && currentTeamTurn.id === myTeam.id;

  // Filter available players (not in picks)
  const draftedPlayerIds = new Set(picks.map(p => p.playerId));
  const undraftedPlayers = availablePlayers
    .filter(p => !draftedPlayerIds.has(p.id))
    .filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()) || p.position.toLowerCase().includes(searchQuery.toLowerCase()) || p.team.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="page-container" style={{ maxWidth: '1400px' }}>
      {/* Header */}
      <div className="feed-header" style={{ marginBottom: '1rem', background: 'var(--bg-secondary)', padding: '1rem', borderRadius: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1>{league.name} Draft Room</h1>
            <div style={{ color: 'var(--text-secondary)' }}>Status: {status}</div>
          </div>
          <div>
            {status === 'PREDRAFT' && isOwner && (
              <button className="btn-primary" onClick={startDraft}>Start Draft</button>
            )}
            {status === 'DRAFTING' && currentTeamTurn && (
              <div style={{ 
                background: isMyTurn ? 'rgba(0,255,0,0.1)' : 'var(--bg-primary)',
                border: isMyTurn ? '1px solid #4ade80' : '1px solid var(--border)',
                padding: '0.8rem 1.5rem',
                borderRadius: '8px',
                textAlign: 'right'
              }}>
                <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Current Turn (Pick {currentPickIndex + 1})</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: isMyTurn ? '#4ade80' : 'var(--text-primary)' }}>
                  {isMyTurn ? 'YOUR TURN!' : currentTeamTurn.name}
                </div>
              </div>
            )}
            {status === 'SEASON' && (
              <div style={{ color: '#4ade80', fontWeight: 'bold', fontSize: '1.2rem' }}>Draft Complete!</div>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr 350px', gap: '2rem', height: 'calc(100vh - 200px)' }}>
        
        {/* Draft Order & Teams Sidebar */}
        <div className="profile-section" style={{ overflowY: 'auto' }}>
          <h2 className="section-title">Draft Order</h2>
          {teams.length === 0 && <p style={{ color: 'var(--text-secondary)' }}>Waiting for teams...</p>}
          {teams.sort((a,b) => (a.draftOrder || 99) - (b.draftOrder || 99)).map((t, idx) => (
            <div key={t.id} style={{ 
              padding: '1rem', 
              borderBottom: '1px solid var(--border)',
              background: currentTeamTurn?.id === t.id ? 'var(--bg-primary)' : 'transparent',
              borderLeft: currentTeamTurn?.id === t.id ? '4px solid var(--brand-red)' : '4px solid transparent'
            }}>
              <div style={{ fontWeight: 'bold' }}>{t.draftOrder ? `${t.draftOrder}. ` : ''}{t.name}</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                {picks.filter(p => p.teamId === t.id).length} players drafted
              </div>
            </div>
          ))}
        </div>

        {/* Available Players */}
        <div className="profile-section" style={{ display: 'flex', flexDirection: 'column' }}>
          <h2 className="section-title">Available Players</h2>
          <input 
            type="text" 
            className="search-input" 
            placeholder="Search players by name, pos, or team..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ width: '100%', marginBottom: '1rem' }}
          />
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {undraftedPlayers.map(p => (
              <div key={p.id} className="post-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.8rem 1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  {p.imageUrl ? (
                    <img src={p.imageUrl} alt={p.name} style={{ width: '50px', height: '50px', borderRadius: '50%', background: '#fff' }} />
                  ) : (
                    <div style={{ width: '50px', height: '50px', borderRadius: '50%', background: 'var(--bg-secondary)' }} />
                  )}
                  <div>
                    <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{p.name}</div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{p.position} • {p.team}</div>
                  </div>
                </div>
                <button 
                  className="btn-primary" 
                  disabled={!isMyTurn || status !== 'DRAFTING'}
                  onClick={() => draftPlayer(p.id)}
                  style={{ opacity: (!isMyTurn || status !== 'DRAFTING') ? 0.5 : 1 }}
                >
                  Draft
                </button>
              </div>
            ))}
            {undraftedPlayers.length === 0 && <p style={{ color: 'var(--text-secondary)' }}>No players found.</p>}
          </div>
        </div>

        {/* Draft History */}
        <div className="profile-section" style={{ display: 'flex', flexDirection: 'column' }}>
          <h2 className="section-title">Recent Picks</h2>
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {picks.length === 0 && <p style={{ color: 'var(--text-secondary)' }}>No picks made yet.</p>}
            {[...picks].reverse().map(pick => {
              const team = teams.find(t => t.id === pick.teamId);
              return (
                <div key={pick.id} style={{ background: 'var(--bg-primary)', padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>
                    Pick {pick.pickNumber} • {team?.name}
                  </div>
                  <div style={{ fontWeight: 'bold' }}>{pick.player.name}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--brand-red)' }}>{pick.player.position} - {pick.player.team}</div>
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </div>
  );
}
