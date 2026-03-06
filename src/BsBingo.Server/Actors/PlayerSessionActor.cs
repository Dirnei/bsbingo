using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Akka.Actor;
using BsBingo.Server.Messages;

namespace BsBingo.Server.Actors;

/// <summary>
/// Bridges a single WebSocket connection to/from the LobbyActor.
/// One instance per connected player.
/// </summary>
public sealed class PlayerSessionActor : ReceiveActor
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    private readonly WebSocket _webSocket;
    private readonly string _playerId;
    private readonly IActorRef _lobbyActor;

    public PlayerSessionActor(WebSocket webSocket, string playerId, IActorRef lobbyActor)
    {
        _webSocket = webSocket;
        _playerId = playerId;
        _lobbyActor = lobbyActor;

        // Messages from the WebSocket (deserialized by the read loop)
        Receive<ClientMessage>(HandleClientMessage);

        // Messages from the LobbyActor (broadcast to this player)
        Receive<LobbyState>(msg => SendToWebSocket("lobby:state", msg));
        Receive<PlayerJoined>(msg => SendToWebSocket("player:joined", msg));
        Receive<PlayerLeft>(msg => SendToWebSocket("player:left", msg));
        Receive<GameStarted>(_ => SendToWebSocket("game:start", new { }));
        Receive<ProgressUpdate>(msg => SendToWebSocket("player:progress", msg));
        Receive<PlayerBingo>(msg => SendToWebSocket("player:bingo", msg));
        Receive<GameRestarted>(_ => SendToWebSocket("game:restart", new { }));
        Receive<LobbyExpired>(_ => SendToWebSocket("lobby:expired", new { }));
        Receive<LobbyClosed>(_ => SendToWebSocket("lobby:closed", new { }));
        Receive<LobbyError>(msg => SendToWebSocket("error", msg));

        // WebSocket closed
        Receive<WebSocketClosed>(_ => HandleDisconnect());
    }

    private void HandleClientMessage(ClientMessage msg)
    {
        switch (msg.Type)
        {
            case "lobby:join":
                if (msg.Payload is not null)
                {
                    var displayName = msg.Payload.Value.GetProperty("displayName").GetString() ?? "Anonymous";
                    _lobbyActor.Tell(new JoinLobby(_playerId, displayName, Self));
                }
                break;

            case "cell:mark":
                if (msg.Payload is not null)
                {
                    var cellIndex = msg.Payload.Value.GetProperty("cellIndex").GetInt32();
                    _lobbyActor.Tell(new MarkCell(_playerId, cellIndex));
                }
                break;

            case "game:start":
                _lobbyActor.Tell(new StartGame(_playerId));
                break;

            case "game:restart":
                _lobbyActor.Tell(new RestartGame(_playerId));
                break;
        }
    }

    private void HandleDisconnect()
    {
        _lobbyActor.Tell(new LeaveLobby(_playerId));
        Context.Stop(Self);
    }

    private void SendToWebSocket(string type, object payload)
    {
        if (_webSocket.State != WebSocketState.Open)
            return;

        var envelope = new ServerMessage(type, payload);
        var json = JsonSerializer.Serialize(envelope, JsonOptions);
        var bytes = Encoding.UTF8.GetBytes(json);

        // Fire-and-forget send; if it fails the socket is dead and will close
        _ = _webSocket.SendAsync(
            new ArraySegment<byte>(bytes),
            WebSocketMessageType.Text,
            endOfMessage: true,
            CancellationToken.None);
    }

    /// <summary>
    /// Runs the WebSocket read loop. Call this from the WebSocket endpoint
    /// after actor creation. Sends ClientMessage/WebSocketClosed to self.
    /// </summary>
    public static async Task RunReadLoopAsync(WebSocket webSocket, IActorRef sessionActor, CancellationToken ct)
    {
        var buffer = new byte[4096];
        try
        {
            while (webSocket.State == WebSocketState.Open && !ct.IsCancellationRequested)
            {
                var result = await webSocket.ReceiveAsync(new ArraySegment<byte>(buffer), ct);

                if (result.MessageType == WebSocketMessageType.Close)
                    break;

                if (result.MessageType == WebSocketMessageType.Text)
                {
                    var json = Encoding.UTF8.GetString(buffer, 0, result.Count);
                    var doc = JsonDocument.Parse(json);
                    var root = doc.RootElement;

                    var type = root.GetProperty("type").GetString() ?? "";
                    JsonElement? payload = root.TryGetProperty("payload", out var p) ? p.Clone() : null;

                    sessionActor.Tell(new ClientMessage(type, payload));
                }
            }
        }
        catch (WebSocketException) { }
        catch (OperationCanceledException) { }
        finally
        {
            sessionActor.Tell(new WebSocketClosed());
        }
    }

    // Internal messages
    public sealed record ClientMessage(string Type, JsonElement? Payload);
    public sealed record WebSocketClosed;
    private sealed record ServerMessage(string Type, object Payload);
}
