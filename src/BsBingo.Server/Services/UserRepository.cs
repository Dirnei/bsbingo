using MongoDB.Driver;
using BsBingo.Server.Models;

namespace BsBingo.Server.Services;

public sealed class UserRepository
{
    private readonly IMongoCollection<User> _users;

    public UserRepository(IMongoDatabase database)
    {
        _users = database.GetCollection<User>("users");
    }

    public async Task<User?> GetByIdAsync(string id)
    {
        return await _users.Find(u => u.Id == id).FirstOrDefaultAsync();
    }

    public async Task<User?> FindByProviderAsync(string provider, string providerId)
    {
        return await _users
            .Find(u => u.OAuthProviders.Any(p => p.Provider == provider && p.ProviderId == providerId))
            .FirstOrDefaultAsync();
    }

    public async Task<User?> FindByEmailAsync(string email)
    {
        return await _users.Find(u => u.Email == email).FirstOrDefaultAsync();
    }

    public async Task InsertAsync(User user)
    {
        await _users.InsertOneAsync(user);
    }

    public async Task<bool> UpdateAsync(User user)
    {
        var result = await _users.ReplaceOneAsync(u => u.Id == user.Id, user);
        return result.MatchedCount > 0;
    }
}
