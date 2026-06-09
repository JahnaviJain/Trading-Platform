from transformers import AutoTokenizer, AutoModelForSequenceClassification
import torch


def analyze_sentiment(sample_text, model_name='ProsusAI/finbert'):
    # Load the tokenizer and model
    tokenizer = AutoTokenizer.from_pretrained(model_name)
    model = AutoModelForSequenceClassification.from_pretrained(model_name)

    # Tokenize the text
    inputs = tokenizer(sample_text, return_tensors='pt')

    # Perform inference
    with torch.no_grad():
        outputs = model(**inputs)

    # Get the prediction
    predicted_class = torch.argmax(outputs.logits, dim=1).item()

    # Map the predicted class to the sentiment
    labels = ['positive', 'negative', 'neutral']

    return labels[predicted_class]


# def main():
#     # Example usage
#     text = "In an exclusive interview Charles Leclerc tells BBC Sport about teaming up with Lewis Hamilton, and his targets."

#     predicted_sentiment = analyze_sentiment(text)

#     print(f"Sentiment: {predicted_sentiment}")


# if __name__ == '__main__':
#     main()
