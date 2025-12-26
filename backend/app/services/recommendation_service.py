"""Friend recommendation service using hybrid AI algorithm."""
import logging
import math
from collections import defaultdict
from typing import Optional

from beanie.operators import And, Or

from app.models import (
    Friendship,
    FriendshipStatus,
    PostLike,
    RankEnum,
    User,
)

logger = logging.getLogger(__name__)


# Rank mapping for numerical comparison
RANK_MAP = {
    RankEnum.BRONZE: 1,
    RankEnum.SILVER: 2,
    RankEnum.GOLD: 3,
    RankEnum.PLATINUM: 4,
    RankEnum.DIAMOND: 5,
    RankEnum.VETERAN: 6,
    RankEnum.MASTER: 7,
    RankEnum.CONQUEROR: 8,
}


async def get_friend_ids(user_id: str) -> set[str]:
    """Get all friend IDs for a user (accepted friendships)."""
    friendships = await Friendship.find(
        Friendship.status == FriendshipStatus.ACCEPTED,
        Or(
            Friendship.requester_id == user_id,
            Friendship.addressee_id == user_id,
        ),
    ).to_list()
    
    friend_ids = set()
    for f in friendships:
        if f.requester_id == user_id:
            friend_ids.add(f.addressee_id)
        else:
            friend_ids.add(f.requester_id)
    
    return friend_ids


async def get_pending_request_ids(user_id: str) -> set[str]:
    """Get all user IDs with pending friend requests (sent or received)."""
    pending = await Friendship.find(
        Friendship.status == FriendshipStatus.PENDING,
        Or(
            Friendship.requester_id == user_id,
            Friendship.addressee_id == user_id,
        ),
    ).to_list()
    
    pending_ids = set()
    for f in pending:
        if f.requester_id == user_id:
            pending_ids.add(f.addressee_id)
        else:
            pending_ids.add(f.requester_id)
    
    return pending_ids


async def get_mutual_friends(user_id: str, candidate_id: str) -> set[str]:
    """Get mutual friends between two users."""
    user_friends = await get_friend_ids(user_id)
    candidate_friends = await get_friend_ids(candidate_id)
    return user_friends & candidate_friends


async def calculate_friend_similarity(user_id: str, candidate_id: str) -> float:
    """
    Calculate friend similarity using Adamic-Adar Index.
    
    This algorithm weights mutual friends by the inverse log of their total friend count.
    Friends with fewer friends are weighted more heavily (more unique connection).
    
    Returns: Score between 0-10 (weighted for 45% of total score)
    """
    mutual_friends = await get_mutual_friends(user_id, candidate_id)
    
    if not mutual_friends:
        return 0.0
    
    score = 0.0
    for friend_id in mutual_friends:
        friend_count = len(await get_friend_ids(friend_id))
        if friend_count > 0:
            # Adamic-Adar: 1 / log(friend_count)
            score += 1.0 / math.log(friend_count + 1)
    
    # Weight: 45% of total (max 4.5)
    return min(score * 4.5, 4.5)


async def calculate_content_similarity(user_id: str, candidate_id: str) -> float:
    """
    Calculate content similarity based on post likes using Cosine Similarity.
    
    For sparse data (few likes), uses weighted overlap where rare posts
    (fewer likes) are weighted more heavily.
    
    Returns: Score between 0-10 (weighted for 35% of total score)
    """
    # Get all post likes for both users
    user_likes = await PostLike.find(PostLike.user_id == user_id).to_list()
    candidate_likes = await PostLike.find(PostLike.user_id == candidate_id).to_list()
    
    if not user_likes or not candidate_likes:
        return 0.0
    
    user_post_ids = {like.post_id for like in user_likes}
    candidate_post_ids = {like.post_id for like in candidate_likes}
    
    # Common posts
    common_posts = user_post_ids & candidate_post_ids
    
    if not common_posts:
        return 0.0
    
    # Weighted overlap: weight by rarity of the post
    # (posts with fewer likes are more unique/valuable matches)
    score = 0.0
    for post_id in common_posts:
        # Count total likes for this post
        total_likes = await PostLike.find(PostLike.post_id == post_id).count()
        if total_likes > 0:
            # Weight by inverse log of popularity
            score += 1.0 / math.log(total_likes + 1)
    
    # Normalize by Jaccard similarity for balance
    union_size = len(user_post_ids | candidate_post_ids)
    jaccard = len(common_posts) / union_size if union_size > 0 else 0
    
    # Combine weighted score with Jaccard
    final_score = (score + jaccard * 5) / 2
    
    # Weight: 35% of total (max 3.5)
    return min(final_score * 3.5, 3.5)


def calculate_rank_similarity(user_rank: Optional[RankEnum], candidate_rank: Optional[RankEnum]) -> float:
    """
    Calculate rank similarity using Gaussian kernel.
    
    Users with closer ranks get higher scores.
    Uses Gaussian (bell curve) so same rank = max score,
    and score decreases with distance.
    
    Returns: Score between 0-10 (weighted for 20% of total score)
    """
    if user_rank is None or candidate_rank is None:
        return 0.0
    
    user_val = RANK_MAP.get(user_rank, 0)
    candidate_val = RANK_MAP.get(candidate_rank, 0)
    
    diff = abs(user_val - candidate_val)
    
    # Gaussian kernel: e^(-(diff^2) / 2)
    # Same rank (diff=0) = 1.0, ±1 rank ≈ 0.6, ±2 ranks ≈ 0.14
    similarity = math.exp(-(diff ** 2) / 2)
    
    # Weight: 20% of total (max 2.0)
    return similarity * 2.0


async def calculate_friend_score(user: User, candidate: User) -> tuple[float, int]:
    """
    Calculate overall friend suggestion score using hybrid algorithm.
    
    Combines:
    - Collaborative Filtering (45%): Mutual friends via Adamic-Adar
    - Content-Based Filtering (35%): Post likes similarity
    - Rank Proximity (20%): Similar game ranks
    
    Returns: (total_score, mutual_friends_count)
    """
    # 1. Friend Similarity (45%)
    friend_score = await calculate_friend_similarity(user.id, candidate.id)
    
    # 2. Content Similarity (35%)
    content_score = await calculate_content_similarity(user.id, candidate.id)
    
    # 3. Rank Similarity (20%)
    rank_score = calculate_rank_similarity(user.rank, candidate.rank)
    
    # Total score (max 10)
    total_score = friend_score + content_score + rank_score
    
    # Get mutual friends count for display
    mutual_friends = await get_mutual_friends(user.id, candidate.id)
    mutual_count = len(mutual_friends)
    
    logger.debug(
        f"Score for {candidate.username}: "
        f"friend={friend_score:.2f}, content={content_score:.2f}, "
        f"rank={rank_score:.2f}, total={total_score:.2f}"
    )
    
    return min(total_score, 10.0), mutual_count


async def get_friend_suggestions(user_id: str, limit: int = 10) -> list[dict]:
    """
    Get friend suggestions for a user using hybrid recommendation algorithm.
    
    Args:
        user_id: ID of the user to get suggestions for
        limit: Maximum number of suggestions to return (default 10, max 50)
    
    Returns:
        List of suggested users with scores, sorted by score descending
    """
    limit = min(limit, 50)  # Cap at 50 suggestions
    
    # Get current user
    user = await User.find_one(User.id == user_id)
    if not user:
        return []
    
    # Get users to exclude
    friend_ids = await get_friend_ids(user_id)
    pending_ids = await get_pending_request_ids(user_id)
    excluded_ids = friend_ids | pending_ids | {user_id}
    
    # Get all potential candidates (users not in excluded list)
    # Only include verified users with profiles for better recommendations
    all_users = await User.find(
        User.profile_verified == True  # noqa: E712
    ).to_list()
    
    candidates = [u for u in all_users if u.id not in excluded_ids]
    
    if not candidates:
        logger.info(f"No candidates found for user {user_id}")
        return []
    
    # Calculate scores for all candidates
    scored_candidates = []
    for candidate in candidates:
        score, mutual_count = await calculate_friend_score(user, candidate)
        
        # Only include if score > 0 (has some connection)
        if score > 0:
            scored_candidates.append({
                "id": candidate.id,
                "username": candidate.username,
                "avatar_url": candidate.avatar_url,
                "rank": candidate.rank,
                "level": candidate.level,
                "mutual_friends_count": mutual_count,
                "suggestion_score": round(score, 2),
            })
    
    # Sort by score descending
    scored_candidates.sort(key=lambda x: x["suggestion_score"], reverse=True)
    
    logger.info(
        f"Generated {len(scored_candidates)} suggestions for user {user_id}, "
        f"returning top {limit}"
    )
    
    return scored_candidates[:limit]
