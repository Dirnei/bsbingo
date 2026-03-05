using Akka.Actor;
using BsBingo.Server.Messages;
using BsBingo.Server.Models;
using BsBingo.Server.Services;

namespace BsBingo.Server.Actors;

public sealed class UserActor : ReceiveActor
{
    public UserActor(UserRepository repository)
    {
        ReceiveAsync<GetOrCreateUser>(async msg =>
        {
            // First, check if a user exists with this exact provider+providerId
            var user = await repository.FindByProviderAsync(msg.Provider, msg.ProviderId);
            if (user is not null)
            {
                // Update profile info from OAuth (name/avatar may change)
                user.DisplayName = msg.DisplayName;
                user.AvatarUrl = msg.AvatarUrl;
                await repository.UpdateAsync(user);
                Sender.Tell(new UserResult(true, User: user));
                return;
            }

            // Check if a user exists with the same email (for account linking)
            if (!string.IsNullOrWhiteSpace(msg.Email))
            {
                user = await repository.FindByEmailAsync(msg.Email);
                if (user is not null)
                {
                    // Link this new OAuth provider to the existing account
                    user.OAuthProviders.Add(new OAuthProvider
                    {
                        Provider = msg.Provider,
                        ProviderId = msg.ProviderId
                    });
                    user.DisplayName = msg.DisplayName;
                    user.AvatarUrl = msg.AvatarUrl;
                    await repository.UpdateAsync(user);
                    Sender.Tell(new UserResult(true, User: user));
                    return;
                }
            }

            // Create a new user
            var newUser = new User
            {
                DisplayName = msg.DisplayName,
                Email = msg.Email,
                AvatarUrl = msg.AvatarUrl,
                OAuthProviders =
                [
                    new OAuthProvider
                    {
                        Provider = msg.Provider,
                        ProviderId = msg.ProviderId
                    }
                ]
            };

            await repository.InsertAsync(newUser);
            Sender.Tell(new UserResult(true, User: newUser));
        });

        ReceiveAsync<GetUser>(async msg =>
        {
            var user = await repository.GetByIdAsync(msg.Id);
            Sender.Tell(user is not null
                ? new UserResult(true, User: user)
                : new UserResult(false, Error: "User not found"));
        });

        ReceiveAsync<LinkOAuthProvider>(async msg =>
        {
            var user = await repository.GetByIdAsync(msg.UserId);
            if (user is null)
            {
                Sender.Tell(new UserResult(false, Error: "User not found"));
                return;
            }

            // Check if this provider is already linked
            if (user.OAuthProviders.Any(p => p.Provider == msg.Provider && p.ProviderId == msg.ProviderId))
            {
                Sender.Tell(new UserResult(true, User: user));
                return;
            }

            user.OAuthProviders.Add(new OAuthProvider
            {
                Provider = msg.Provider,
                ProviderId = msg.ProviderId
            });

            await repository.UpdateAsync(user);
            Sender.Tell(new UserResult(true, User: user));
        });
    }
}
