using BsBingo.Server.Models;

namespace BsBingo.Server.Messages;

public sealed record GetOrCreateUser(
    string Provider,
    string ProviderId,
    string DisplayName,
    string Email,
    string? AvatarUrl);

public sealed record GetUser(string Id);

public sealed record LinkOAuthProvider(string UserId, string Provider, string ProviderId);

public sealed record UserResult(bool Success, string? Error = null, User? User = null);
