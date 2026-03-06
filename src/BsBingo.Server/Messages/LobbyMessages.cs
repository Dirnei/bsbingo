using Akka.Actor;

namespace BsBingo.Server.Messages;

// Commands sent to LobbyManagerActor
public sealed record CreateLobby(string GroupId, string HostDisplayName);
public sealed record FindLobby(string LobbyCode);

// Responses from LobbyManagerActor
public sealed record LobbyCreated(string LobbyCode, IActorRef LobbyActorRef);
public sealed record LobbyFound(string LobbyCode, IActorRef LobbyActorRef);
public sealed record LobbyNotFound(string LobbyCode);

// Commands sent to LobbyActor
public sealed record JoinLobby(string PlayerId, string DisplayName, IActorRef PlayerSession);
public sealed record LeaveLobby(string PlayerId);
public sealed record StartGame(string PlayerId);
public sealed record MarkCell(string PlayerId, int CellIndex);
public sealed record RestartGame(string PlayerId);

// Broadcasts from LobbyActor (sent to all player sessions)
public sealed record LobbyState(
    string LobbyCode,
    string GroupId,
    string CurrentPlayerId,
    List<LobbyPlayerInfo> Players,
    bool GameStarted,
    List<BoardCell>? Board,
    HashSet<int>? MarkedCells);

public sealed record LobbyPlayerInfo(string PlayerId, string DisplayName, bool IsHost, int MarkedCount, int BingoCount);

public sealed record PlayerJoined(string PlayerId, string DisplayName);
public sealed record PlayerLeft(string PlayerId, string DisplayName);
public sealed record GameStarted;
public sealed record ProgressUpdate(string PlayerId, int MarkedCount);
public sealed record PlayerBingo(string PlayerId, string DisplayName, List<int> WinningLine);
public sealed record GameRestarted;
public sealed record LobbyExpired;
public sealed record LobbyClosed;

// Errors
public sealed record LobbyError(string Message);
