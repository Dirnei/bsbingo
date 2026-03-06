using Akka.Actor;
using BsBingo.Server.Messages;

namespace BsBingo.Server.Actors;

public sealed class LobbyActor : ReceiveActor
{
    private static readonly Random Rng = new();

    /// All 12 possible bingo lines: 5 rows, 5 columns, 2 diagonals
    private static readonly int[][] Lines =
    [
        [0, 1, 2, 3, 4], [5, 6, 7, 8, 9], [10, 11, 12, 13, 14], [15, 16, 17, 18, 19], [20, 21, 22, 23, 24],
        [0, 5, 10, 15, 20], [1, 6, 11, 16, 21], [2, 7, 12, 17, 22], [3, 8, 13, 18, 23], [4, 9, 14, 19, 24],
        [0, 6, 12, 18, 24], [4, 8, 12, 16, 20],
    ];

    private const int FreeIndex = 12;

    private readonly string _lobbyCode;
    private readonly string _groupId;
    private readonly List<string> _words;
    private readonly Dictionary<string, PlayerState> _players = new();
    private string? _hostPlayerId;
    private bool _gameStarted;

    public LobbyActor(string lobbyCode, string groupId, List<string> words, TimeSpan inactivityTimeout)
    {
        _lobbyCode = lobbyCode;
        _groupId = groupId;
        _words = words;

        Context.SetReceiveTimeout(inactivityTimeout);

        Receive<JoinLobby>(HandleJoin);
        Receive<LeaveLobby>(HandleLeave);
        Receive<StartGame>(HandleStartGame);
        Receive<MarkCell>(HandleMarkCell);
        Receive<RestartGame>(HandleRestartGame);
        Receive<ReceiveTimeout>(_ => HandleTimeout());
    }

    private void HandleJoin(JoinLobby msg)
    {
        if (_players.ContainsKey(msg.PlayerId))
        {
            // Reconnect: update session ref
            _players[msg.PlayerId] = _players[msg.PlayerId] with { Session = msg.PlayerSession };
        }
        else
        {
            var board = GenerateBoard();
            var markedCells = new HashSet<int> { FreeIndex };
            _players[msg.PlayerId] = new PlayerState(msg.PlayerId, msg.DisplayName, msg.PlayerSession, board, markedCells, 0);

            if (_hostPlayerId is null)
                _hostPlayerId = msg.PlayerId;
        }

        // Send full lobby state to the joining player
        var playerState = _players[msg.PlayerId];
        msg.PlayerSession.Tell(new LobbyState(
            _lobbyCode,
            _groupId,
            msg.PlayerId,
            GetPlayerInfoList(),
            _gameStarted,
            playerState.Board,
            playerState.MarkedCells));

        // Broadcast player joined to all other players
        BroadcastExcept(new PlayerJoined(msg.PlayerId, msg.DisplayName), msg.PlayerId);
    }

    private void HandleLeave(LeaveLobby msg)
    {
        if (!_players.TryGetValue(msg.PlayerId, out var player))
            return;

        _players.Remove(msg.PlayerId);
        Broadcast(new PlayerLeft(msg.PlayerId, player.DisplayName));

        // Transfer host if the host left
        if (_hostPlayerId == msg.PlayerId)
        {
            _hostPlayerId = _players.Keys.FirstOrDefault();
        }

        // Self-destruct if no players remain
        if (_players.Count == 0)
        {
            Context.Stop(Self);
        }
    }

    private void HandleStartGame(StartGame msg)
    {
        if (msg.PlayerId != _hostPlayerId)
        {
            if (_players.TryGetValue(msg.PlayerId, out var p))
                p.Session.Tell(new LobbyError("Only the host can start the game"));
            return;
        }

        _gameStarted = true;
        Broadcast(new GameStarted());
    }

    private void HandleMarkCell(MarkCell msg)
    {
        if (!_gameStarted)
            return;

        if (!_players.TryGetValue(msg.PlayerId, out var player))
            return;

        if (msg.CellIndex is < 0 or >= 25 || msg.CellIndex == FreeIndex)
            return;

        // Toggle the mark
        if (!player.MarkedCells.Add(msg.CellIndex))
            player.MarkedCells.Remove(msg.CellIndex);

        // Broadcast progress (marked count excludes free space)
        var markedCount = player.MarkedCells.Count - 1;
        Broadcast(new ProgressUpdate(msg.PlayerId, markedCount));

        // Check for bingo
        var winningLine = DetectNewBingo(player.MarkedCells);
        if (winningLine is not null)
        {
            _players[msg.PlayerId] = player with { BingoCount = player.BingoCount + 1 };
            Broadcast(new PlayerBingo(msg.PlayerId, player.DisplayName, winningLine));
        }
    }

    private void HandleRestartGame(RestartGame msg)
    {
        if (msg.PlayerId != _hostPlayerId)
        {
            if (_players.TryGetValue(msg.PlayerId, out var p))
                p.Session.Tell(new LobbyError("Only the host can restart the game"));
            return;
        }

        // Regenerate boards and reset state for all players
        foreach (var playerId in _players.Keys.ToList())
        {
            var existing = _players[playerId];
            var newBoard = GenerateBoard();
            _players[playerId] = existing with
            {
                Board = newBoard,
                MarkedCells = new HashSet<int> { FreeIndex },
                BingoCount = 0
            };
        }

        _gameStarted = false;
        Broadcast(new GameRestarted());

        // Send each player their new board via full lobby state
        foreach (var (playerId, player) in _players)
        {
            player.Session.Tell(new LobbyState(
                _lobbyCode,
                _groupId,
                playerId,
                GetPlayerInfoList(),
                _gameStarted,
                player.Board,
                player.MarkedCells));
        }
    }

    private void HandleTimeout()
    {
        Broadcast(new LobbyExpired());
        Context.Stop(Self);
    }

    private List<BoardCell> GenerateBoard()
    {
        var shuffled = _words.OrderBy(_ => Rng.Next()).ToList();
        var selected = shuffled.Take(24).ToList();

        var cells = new List<BoardCell>(25);
        var wordIndex = 0;
        for (var i = 0; i < 25; i++)
        {
            if (i == FreeIndex)
                cells.Add(new BoardCell(i, "FREE\n☕", true));
            else
                cells.Add(new BoardCell(i, selected[wordIndex++], false));
        }

        return cells;
    }

    private static List<int>? DetectNewBingo(HashSet<int> marked)
    {
        foreach (var line in Lines)
        {
            if (line.All(i => marked.Contains(i)))
                return line.ToList();
        }

        return null;
    }

    private List<LobbyPlayerInfo> GetPlayerInfoList()
    {
        return _players.Values.Select(p => new LobbyPlayerInfo(
            p.PlayerId,
            p.DisplayName,
            p.PlayerId == _hostPlayerId,
            p.MarkedCells.Count - 1, // exclude free space
            p.BingoCount
        )).ToList();
    }

    private void Broadcast(object message)
    {
        foreach (var player in _players.Values)
            player.Session.Tell(message);
    }

    private void BroadcastExcept(object message, string excludePlayerId)
    {
        foreach (var player in _players.Values)
        {
            if (player.PlayerId != excludePlayerId)
                player.Session.Tell(message);
        }
    }

    private sealed record PlayerState(
        string PlayerId,
        string DisplayName,
        IActorRef Session,
        List<BoardCell> Board,
        HashSet<int> MarkedCells,
        int BingoCount);
}
