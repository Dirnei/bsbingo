using Akka.Actor;
using BsBingo.Server.Messages;
using BsBingo.Server.Services;

namespace BsBingo.Server.Actors;

public sealed class LobbyManagerActor : ReceiveActor
{
    private static readonly Random Rng = new();
    private static readonly char[] CodeChars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".ToCharArray();
    private const int CodeLength = 6;
    private const int MaxCodeAttempts = 100;
    private static readonly TimeSpan DefaultInactivityTimeout = TimeSpan.FromMinutes(30);

    private readonly Dictionary<string, IActorRef> _lobbies = new();

    public LobbyManagerActor(GroupRepository groupRepository)
    {
        ReceiveAsync<CreateLobby>(async msg =>
        {
            var group = await groupRepository.GetByIdAsync(msg.GroupId);
            if (group is null)
            {
                Sender.Tell(new LobbyNotFound("GROUP_NOT_FOUND"));
                return;
            }

            var code = GenerateUniqueCode();
            if (code is null)
            {
                Sender.Tell(new LobbyNotFound("FULL"));
                return;
            }

            var lobbyActor = Context.ActorOf(
                Props.Create(() => new LobbyActor(code, msg.GroupId, group.Words, DefaultInactivityTimeout)),
                $"lobby-{code}");

            Context.Watch(lobbyActor);
            _lobbies[code] = lobbyActor;

            Sender.Tell(new LobbyCreated(code, lobbyActor));
        });

        Receive<FindLobby>(msg =>
        {
            if (_lobbies.TryGetValue(msg.LobbyCode.ToUpperInvariant(), out var lobbyActor))
            {
                Sender.Tell(new LobbyFound(msg.LobbyCode.ToUpperInvariant(), lobbyActor));
            }
            else
            {
                Sender.Tell(new LobbyNotFound(msg.LobbyCode));
            }
        });

        Receive<Terminated>(msg =>
        {
            var code = _lobbies
                .FirstOrDefault(kvp => kvp.Value.Equals(msg.ActorRef))
                .Key;

            if (code is not null)
            {
                _lobbies.Remove(code);
            }
        });
    }

    private string? GenerateUniqueCode()
    {
        for (var attempt = 0; attempt < MaxCodeAttempts; attempt++)
        {
            var code = new string(Enumerable.Range(0, CodeLength)
                .Select(_ => CodeChars[Rng.Next(CodeChars.Length)])
                .ToArray());

            if (!_lobbies.ContainsKey(code))
                return code;
        }

        return null;
    }
}
