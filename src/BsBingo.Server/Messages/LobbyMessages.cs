using Akka.Actor;

namespace BsBingo.Server.Messages;

// Commands sent to LobbyManagerActor
public sealed record CreateLobby(string GroupId, string HostDisplayName);
public sealed record FindLobby(string LobbyCode);

// Responses from LobbyManagerActor
public sealed record LobbyCreated(string LobbyCode, IActorRef LobbyActorRef);
public sealed record LobbyFound(string LobbyCode, IActorRef LobbyActorRef);
public sealed record LobbyNotFound(string LobbyCode);
