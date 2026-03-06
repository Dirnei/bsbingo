using System.Security.Cryptography;
using System.Text;
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
    private readonly List<MarkHistoryEntry> _markHistory = new();
    private readonly HashSet<string> _markedWords = new(StringComparer.OrdinalIgnoreCase);
    private string? _hostPlayerId;
    private bool _gameStarted;
    private LobbySettings _settings = new(AllowMultipleBingos: true, AutoSelect: false);

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
        Receive<UpdateSettings>(HandleUpdateSettings);
        Receive<SendChat>(HandleChat);
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
            // Reject duplicate display names
            if (_players.Values.Any(p => string.Equals(p.DisplayName, msg.DisplayName, StringComparison.OrdinalIgnoreCase)))
            {
                msg.PlayerSession.Tell(new LobbyError($"Der Name \"{msg.DisplayName}\" ist bereits vergeben"));
                return;
            }

            var board = GenerateBoard();
            var markedCells = new HashSet<int> { FreeIndex };
            var gravatarHash = ComputeGravatarHash(msg.Email ?? msg.DisplayName);
            var isSpectator = _gameStarted;
            _players[msg.PlayerId] = new PlayerState(msg.PlayerId, msg.DisplayName, msg.PlayerSession, board, markedCells, 0, new HashSet<int>(), gravatarHash, isSpectator);

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
            playerState.IsSpectator,
            playerState.IsSpectator ? null : playerState.Board,
            playerState.IsSpectator ? null : playerState.MarkedCells,
            _markHistory,
            _settings));

        // Broadcast player joined to all other players
        BroadcastExcept(new PlayerJoined(msg.PlayerId, msg.DisplayName, playerState.GravatarHash), msg.PlayerId);
    }

    private void HandleLeave(LeaveLobby msg)
    {
        if (!_players.TryGetValue(msg.PlayerId, out var player))
            return;

        _players.Remove(msg.PlayerId);

        if (_hostPlayerId == msg.PlayerId)
        {
            // Host left — close lobby for everyone
            Broadcast(new LobbyClosed());
            Context.Stop(Self);
            return;
        }

        Broadcast(new PlayerLeft(msg.PlayerId, player.DisplayName));

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

        // Send each player their full state so the client has the board
        foreach (var (playerId, player) in _players)
        {
            player.Session.Tell(new LobbyState(
                _lobbyCode,
                _groupId,
                playerId,
                GetPlayerInfoList(),
                _gameStarted,
                player.IsSpectator,
                player.Board,
                player.MarkedCells,
                _markHistory,
            _settings));
        }
    }

    private void HandleMarkCell(MarkCell msg)
    {
        if (!_gameStarted)
            return;

        if (!_players.TryGetValue(msg.PlayerId, out var player))
            return;

        if (player.IsSpectator)
            return;

        if (msg.CellIndex is < 0 or >= 25 || msg.CellIndex == FreeIndex)
            return;

        // Toggle the mark
        var isMarking = player.MarkedCells.Add(msg.CellIndex);
        if (!isMarking)
            player.MarkedCells.Remove(msg.CellIndex);

        // Broadcast progress (marked count excludes free space)
        var markedCount = player.MarkedCells.Count - 1;
        Broadcast(new ProgressUpdate(msg.PlayerId, markedCount));

        // When marking (not unmarking), broadcast the selected word
        if (isMarking)
        {
            var word = player.Board[msg.CellIndex].Text;
            var timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            Broadcast(new CellSelected(msg.PlayerId, player.DisplayName, word, timestamp));

            // Track first-time word selections
            if (_markedWords.Add(word))
            {
                _markHistory.Add(new MarkHistoryEntry(msg.PlayerId, player.DisplayName, word, timestamp));
            }

            // Auto-select: mark the same word on all other players' boards
            if (_settings.AutoSelect)
            {
                AutoSelectWord(word, msg.PlayerId);
            }
        }

        // Check bingos for the marking player
        CheckBingos(msg.PlayerId);
    }

    private void AutoSelectWord(string word, string sourcePlayerId)
    {
        // Collect targets first to avoid modifying _players during iteration
        var targets = new List<(string PlayerId, int CellIndex)>();
        foreach (var (playerId, otherPlayer) in _players)
        {
            if (playerId == sourcePlayerId || otherPlayer.IsSpectator)
                continue;

            var cellIndex = otherPlayer.Board.FindIndex(c => !c.IsFreeSpace &&
                string.Equals(c.Text, word, StringComparison.OrdinalIgnoreCase));

            if (cellIndex >= 0 && !otherPlayer.MarkedCells.Contains(cellIndex))
                targets.Add((playerId, cellIndex));
        }

        foreach (var (playerId, cellIndex) in targets)
        {
            var player = _players[playerId];
            player.MarkedCells.Add(cellIndex);
            player.Session.Tell(new CellAutoMarked(cellIndex));

            var count = player.MarkedCells.Count - 1;
            Broadcast(new ProgressUpdate(playerId, count));

            CheckBingos(playerId);
        }
    }

    private void CheckBingos(string playerId)
    {
        if (!_players.TryGetValue(playerId, out var player))
            return;

        // If multiple bingos disabled and player already has one, skip
        if (!_settings.AllowMultipleBingos && player.BingoCount > 0)
            return;

        var newBingos = new List<(int LineIndex, int[] Line)>();
        for (var i = 0; i < Lines.Length; i++)
        {
            var isComplete = Lines[i].All(idx => player.MarkedCells.Contains(idx));
            if (isComplete && player.CompletedLines.Add(i))
                newBingos.Add((i, Lines[i]));
            else if (!isComplete)
                player.CompletedLines.Remove(i);
        }

        foreach (var (_, line) in newBingos)
        {
            // Re-read from dictionary to get current BingoCount after previous iterations
            var current = _players[playerId];
            if (!_settings.AllowMultipleBingos && current.BingoCount > 0)
                break;

            _players[playerId] = current with { BingoCount = current.BingoCount + 1 };
            Broadcast(new PlayerBingo(playerId, player.DisplayName, line.ToList()));
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

        // Regenerate boards and reset state for all players (spectators become regular players)
        foreach (var playerId in _players.Keys.ToList())
        {
            var existing = _players[playerId];
            var newBoard = GenerateBoard();
            _players[playerId] = existing with
            {
                Board = newBoard,
                MarkedCells = new HashSet<int> { FreeIndex },
                BingoCount = 0,
                CompletedLines = new HashSet<int>(),
                IsSpectator = false
            };
        }

        _gameStarted = false;
        _markHistory.Clear();
        _markedWords.Clear();
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
                false,
                player.Board,
                player.MarkedCells,
                _markHistory,
            _settings));
        }
    }

    private void HandleUpdateSettings(UpdateSettings msg)
    {
        if (msg.PlayerId != _hostPlayerId)
        {
            if (_players.TryGetValue(msg.PlayerId, out var p))
                p.Session.Tell(new LobbyError("Only the host can change settings"));
            return;
        }

        _settings = new LobbySettings(msg.AllowMultipleBingos, msg.AutoSelect);
        Broadcast(new SettingsChanged(_settings));
    }

    private void HandleChat(SendChat msg)
    {
        if (!_players.TryGetValue(msg.PlayerId, out var player))
            return;

        var text = msg.Text.Trim();
        if (string.IsNullOrEmpty(text) || text.Length > 500)
            return;

        var timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        Broadcast(new ChatMessage(msg.PlayerId, player.DisplayName, player.GravatarHash, text, timestamp));
    }

    private void HandleTimeout()
    {
        Broadcast(new LobbyExpired());
        Context.Stop(Self);
    }

    private static string ComputeGravatarHash(string input)
    {
        var normalized = input.Trim().ToLowerInvariant();
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(normalized));
        return Convert.ToHexStringLower(bytes);
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

    private List<LobbyPlayerInfo> GetPlayerInfoList()
    {
        return _players.Values.Select(p => new LobbyPlayerInfo(
            p.PlayerId,
            p.DisplayName,
            p.PlayerId == _hostPlayerId,
            p.MarkedCells.Count - 1, // exclude free space
            p.BingoCount,
            p.GravatarHash,
            p.IsSpectator
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
        int BingoCount,
        HashSet<int> CompletedLines,
        string? GravatarHash,
        bool IsSpectator);
}
